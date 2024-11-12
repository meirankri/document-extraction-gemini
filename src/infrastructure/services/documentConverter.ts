import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

interface ConversionResult {
    success: boolean;
    message: string;
}

export class DocumentConverter {
    static async convertToPdf(inputPath: string, outputPath: string): Promise<ConversionResult> {
        try {
            console.log(`Starting conversion of ${inputPath} to ${outputPath}`);
            
            // Vérifier que le fichier existe
            await fs.access(inputPath);
            
            // Créer le dossier de sortie s'il n'existe pas
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            
            // Commande LibreOffice pour la conversion
            const command = `soffice --headless --convert-to pdf --outdir "${path.dirname(outputPath)}" "${inputPath}"`;
            
            console.log('Executing LibreOffice command...');
            const { stdout, stderr } = await execAsync(command);
            
            if (stderr) {
                console.error('LibreOffice stderr:', stderr);
            }
            
            console.log('LibreOffice stdout:', stdout);
            
            // Le fichier de sortie de LibreOffice aura le même nom mais avec extension .pdf
            const libreOfficeOutput = path.join(
                path.dirname(outputPath),
                `${path.basename(inputPath, path.extname(inputPath))}.pdf`
            );
            
            // Renommer le fichier si nécessaire
            if (libreOfficeOutput !== outputPath) {
                await fs.rename(libreOfficeOutput, outputPath);
            }
            
            // Vérifier que le PDF a été créé
            await fs.access(outputPath);
            
            console.log('Conversion completed successfully');
            return {
                success: true,
                message: 'Conversion successful'
            };
            
        } catch (error) {
            console.error('Conversion error:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
} 