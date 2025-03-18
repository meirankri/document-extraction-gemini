import { PDFDocument } from "pdf-lib";

export class PdfService {
  /**
   * Extrait la première page d'un document PDF
   * @param pdfBuffer Buffer du document PDF
   * @returns Buffer contenant uniquement la première page
   */
  static async extractFirstPage(pdfBuffer: Buffer): Promise<Buffer> {
    try {
      // Charger le document PDF
      const pdfDoc = await PDFDocument.load(pdfBuffer);

      // Créer un nouveau document avec seulement la première page
      const newPdfDoc = await PDFDocument.create();

      // S'assurer que le document a au moins une page
      if (pdfDoc.getPageCount() === 0) {
        throw new Error("Le document PDF ne contient aucune page");
      }

      // Copier la première page dans le nouveau document
      const [firstPage] = await newPdfDoc.copyPages(pdfDoc, [0]);
      newPdfDoc.addPage(firstPage);

      // Sauvegarder et retourner le nouveau document
      const newPdfBytes = await newPdfDoc.save();

      return Buffer.from(newPdfBytes);
    } catch (error) {
      console.error("Erreur lors de l'extraction de la première page:", error);
      // En cas d'erreur, on retourne le document original
      return pdfBuffer;
    }
  }
}
