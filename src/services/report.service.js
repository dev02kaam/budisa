const PDFDocument = require('pdfkit');
const { getTrackerDays, validDateKey } = require('./fleet.service');

function reportError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = 'INVALID_REPORT';
  return error;
}

async function getReportDays(selection) {
  if (!Array.isArray(selection) || !selection.length || selection.length > 1000) {
    throw reportError('Selecciona entre 1 y 1.000 jornadas para exportar.');
  }
  const unique = new Map();
  for (const item of selection) {
    if (!item || typeof item.imei !== 'string' || !/^\d{15}$/.test(item.imei)
      || typeof item.date !== 'string' || !validDateKey(item.date)) {
      throw reportError('Una de las jornadas seleccionadas no es válida.');
    }
    unique.set(`${item.imei}|${item.date}`, { imei: item.imei, date: item.date });
  }
  const days = await getTrackerDays({}, unique.size, { selection: [...unique.values()] });
  if (days.length !== unique.size) throw reportError('Alguna jornada ya no está disponible. Actualiza el histórico y vuelve a exportar.', 409);
  return days.sort((a, b) => a.date.localeCompare(b.date) || a.licensePlate.localeCompare(b.licensePlate, 'es'));
}

function position(latitude, longitude) {
  return latitude == null || longitude == null ? 'Sin ubicación'
    : `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`;
}

function instant(value) {
  if (!value) return 'Pendiente de cierre';
  return new Date(value).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'medium' });
}

function duration(seconds) {
  if (seconds == null) return 'Pendiente';
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 3600)} h ${Math.floor(total % 3600 / 60)} min ${total % 60} s`;
}

function reportRows(days) {
  return days.flatMap((day) => {
    const identity = `${day.licensePlate || 'Sin matrícula'}\n${day.date.split('-').reverse().join('/')}`;
    if (!day.tipEvents.length) return [[identity, 'Sin basculaciones', '-', '-', '-', '-']];
    return day.tipEvents.map((event) => [identity, instant(event.timestamp), position(event.latitude, event.longitude),
      instant(event.endAt), event.endAt ? position(event.endLatitude, event.endLongitude) : '-', duration(event.durationSeconds)]);
  });
}

function createReportPdf(days, generatedAt = new Date()) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true,
      info: { Title: 'Budisa - Informe de basculaciones', Author: 'Budisa', CreationDate: generatedAt } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      const width = doc.page.width - 72;
      const columns = [104, 108, 150, 108, 150, width - 620];
      const labels = ['Matrícula / Jornada', 'Inicio', 'Posición de inicio', 'Fin', 'Posición de fin', 'Duración'];
      const rows = reportRows(days);
      const count = days.reduce((sum, day) => sum + day.tipEvents.length, 0);
      const vehicleCount = new Set(days.map((day) => day.imei)).size;
      const dates = days.map((day) => day.date).sort();
      let y;
      function heading(continued = false) {
        doc.font('Helvetica-Bold').fontSize(20).fillColor('#142136').text('BUDISA', 36, 28, { lineBreak: false });
        doc.fontSize(15).text('Informe de basculaciones', 155, 31, { lineBreak: false });
        doc.font('Helvetica').fontSize(8).fillColor('#526074').text(`Emitido: ${instant(generatedAt)} · Europe/Madrid`, 36, 57, { width });
        doc.fontSize(10).fillColor('#142136').text(`${days.length} jornadas · ${vehicleCount} vehículos · ${count} basculaciones${continued ? ' · Continuación' : ''}`, 36, 78, { width });
        doc.fontSize(8).fillColor('#526074').text(`${dates[0]} a ${dates[dates.length - 1]} · Solo las jornadas seleccionadas · Coordenadas GPS (latitud, longitud)`, 36, 96, { width });
        y = 117;
        doc.rect(36, y, width, 28).fill('#142136');
        let x = 36;
        labels.forEach((label, index) => {
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff').text(label, x + 7, y + 9, { width: columns[index] - 14, lineBreak: false });
          x += columns[index];
        });
        y += 28;
      }
      heading();
      rows.forEach((row, rowIndex) => {
        doc.font('Helvetica').fontSize(9);
        const height = Math.max(42, ...row.map((text, index) => doc.heightOfString(text, { width: columns[index] - 14 }) + 18));
        if (y + height > doc.page.height - 52) { doc.addPage(); heading(true); }
        if (rowIndex % 2 === 0) doc.rect(36, y, width, height).fill('#f0f4f8');
        let x = 36;
        row.forEach((text, index) => {
          doc.font(index === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
            .fillColor(index === 1 ? '#167044' : index === 3 ? '#a82c3d' : '#142136')
            .text(text, x + 7, y + 9, { width: columns[index] - 14 });
          x += columns[index];
        });
        doc.moveTo(36, y + height).lineTo(36 + width, y + height).strokeColor('#d8e0e9').lineWidth(0.5).stroke();
        y += height;
      });
      const pages = doc.bufferedPageRange();
      for (let index = 0; index < pages.count; index++) {
        doc.switchToPage(index);
        doc.font('Helvetica').fontSize(8).fillColor('#526074')
          .text('Inicio en verde · Fin en rojo · Sin ubicación: no había posición GPS válida en esa lectura.', 36, doc.page.height - 46, { width: width - 85, lineBreak: false });
        doc.text(`${index + 1} / ${pages.count}`, doc.page.width - 100, doc.page.height - 46, { width: 64, align: 'right', lineBreak: false });
      }
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}

module.exports = { getReportDays, createReportPdf, reportRows };
