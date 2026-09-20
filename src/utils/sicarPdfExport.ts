import { jsPDF } from 'jspdf';
import { SicarProperty, SicarLayerInfo } from './sicarEngine';
import { ParsedCoordinate } from './gmsParser';
import brandLogo from '../assets/images/batalhao_ambiental_logo_1779854041969.png';

export async function exportSicarPdf(
  properties: SicarProperty[],
  coordinate: ParsedCoordinate,
  layerInfo: SicarLayerInfo | null
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let currentY = margin;

  // Header Background bar
  doc.setFillColor(35, 71, 35); // military-300 dark forest green
  doc.rect(margin, currentY, pageWidth - margin * 2, 22, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('POLÍCIA MILITAR DO ESTADO DO ACRE - BPA', margin + 6, currentY + 8);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('BATALHÃO DE POLICIAMENTO AMBIENTAL • CONSULTA ESPACIAL SICAR', margin + 6, currentY + 14);
  doc.text('RELATÓRIO FISCAL DE INTERSEÇÃO E IDENTIFICAÇÃO DE IMÓVEL RURAL', margin + 6, currentY + 19);

  currentY += 26;

  // Metadata Box (Date, Time, Query Point)
  doc.setDrawColor(203, 210, 201);
  doc.setFillColor(244, 247, 243);
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, 30, 2, 2, 'FD');

  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR');

  doc.setTextColor(16, 36, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DADOS DA CONSULTA GEOESPACIAL (POINT IN POLYGON)', margin + 4, currentY + 6);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Data e Hora da Consulta: ${dateStr}`, margin + 4, currentY + 12);
  doc.text(`Coordenada GMS: ${coordinate.fullGms}`, margin + 4, currentY + 17);
  doc.text(`Latitude Decimal: ${coordinate.latFormatted} | Longitude Decimal: ${coordinate.lngFormatted}`, margin + 4, currentY + 22);
  doc.text(`Base Carregada: ${layerInfo?.layerName || 'SICAR Oficial'} (${layerInfo?.srid || 'SIRGAS 2000'})`, margin + 4, currentY + 27);

  currentY += 34;

  // Overlap Alert or Single property banner
  const count = properties.length;
  if (count > 1) {
    doc.setFillColor(254, 243, 199); // light amber
    doc.setDrawColor(245, 158, 11);
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, 10, 2, 2, 'FD');
    doc.setTextColor(146, 64, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(`ALERTA: FORAM ENCONTRADOS ${count} IMÓVEIS SOBREPOSTOS NESTA COORDENADA`, margin + 4, currentY + 6.5);
    currentY += 14;
  } else if (count === 1) {
    doc.setFillColor(236, 253, 245); // light emerald
    doc.setDrawColor(16, 185, 129);
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, 10, 2, 2, 'FD');
    doc.setTextColor(6, 95, 70);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(`1 IMÓVEL RURAL CADASTRADO ENCONTRADO NO PONTO CONSULTADO`, margin + 4, currentY + 6.5);
    currentY += 14;
  } else {
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(239, 68, 68);
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, 10, 2, 2, 'FD');
    doc.setTextColor(153, 27, 27);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(`NENHUM IMÓVEL DO CAR ENCONTRADO CONTENDO ESTA COORDENADA`, margin + 4, currentY + 6.5);
    currentY += 14;
  }

  // Properties details
  properties.forEach((prop, index) => {
    // Check if new page needed
    if (currentY > pageHeight - 65) {
      doc.addPage();
      currentY = margin;
    }

    const title = count > 1 ? `CAR ${index + 1} - DETALHAMENTO DO IMÓVEL` : 'DADOS DO IMÓVEL RURAL NO SICAR';

    doc.setFillColor(35, 71, 35);
    doc.rect(margin, currentY, pageWidth - margin * 2, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(title, margin + 3, currentY + 4.5);
    currentY += 8;

    doc.setDrawColor(203, 210, 201);
    doc.setFillColor(255, 255, 255);
    doc.rect(margin, currentY, pageWidth - margin * 2, 54, 'FD');

    const fields = [
      ['Número do CAR:', prop.numCar],
      ['Código do Imóvel:', prop.codImovel],
      ['Município:', prop.municipio],
      ['Área do Imóvel:', prop.areaHa],
      ['Situação do CAR:', prop.situacao],
      ['Proprietário/Possuidor:', prop.proprietario],
      ['Data do Cadastro:', prop.dataCadastro],
      ['Área Reserva Legal (ARL):', prop.reservaLegalHa],
      ['Área de Preservação (APP):', prop.appHa],
    ];

    let rowY = currentY + 5;
    doc.setFontSize(8);

    fields.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(45, 72, 45);
      doc.text(label, margin + 4, rowY);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(13, 20, 12);
      
      const textVal = String(value || 'Informação não disponível nesta base.');
      // Truncate long owner strings cleanly
      const displayVal = textVal.length > 58 ? textVal.substring(0, 56) + '...' : textVal;
      doc.text(displayVal, margin + 50, rowY);

      rowY += 5.2;
    });

    currentY += 58;
  });

  // Footer / Fiscal verification
  const footerY = pageHeight - 14;
  doc.setDrawColor(203, 210, 201);
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);
  doc.setFontSize(7.5);
  doc.setTextColor(125, 143, 123);
  doc.text('Documento gerado eletronicamente para fins de instrução de fiscalização ambiental e tática.', margin, footerY);
  doc.text('BPA Acre • SICAR Geoprocessamento Autônomo', pageWidth - margin - 60, footerY);

  const cleanFileName = `Relatorio_CAR_${coordinate.latFormatted}_${coordinate.lngFormatted}.pdf`;
  doc.save(cleanFileName);
}
