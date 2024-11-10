import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { Document, MedicalInfo } from '../../domain/models';
import { DocumentExtractor, ExternalApiPort } from '../../domain/ports';
import { logger } from '../../utils/logger';

export class GeminiDocumentExtractor implements DocumentExtractor {
    private readonly genAI: GoogleGenerativeAI;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    async extract(document: Document): Promise<MedicalInfo> {
        const model = this.genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            safetySettings: [
                {
                  category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                },
                {
                  category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                },
                {
                  category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                },
                {
                  category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                }
            ],
            generationConfig: {
                temperature: 1,
                topP: 0.95,
                topK: 64,
                maxOutputTokens: 8192,
            }
        });

        const prompt = `Extrait ces informations et retourne sous format JSON:
            - patientFirstName
            - patientLastName
            - patientGender
            - patientBirthdate
            - examinationDate
            - examinationType
            pour l'examinationType, si c'est un examen de type "Résultats de biologie", retourne Analyses Sanguines.
            l'patientBirthdate et examinationDate doivent être au format DD/MM/YYYY.
            le patientGender doit être M ou F.
            `;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: document.content.toString('base64'),
                    mimeType: document.mimeType
                }
            }
        ]);


        const response = result.response;
        const text = response.text();
        console.log("result ai", text);

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        
        if (!jsonMatch) {
            throw new Error('Aucun JSON valide trouvé dans la réponse');
        }
        
        return JSON.parse(jsonMatch[0]);
    }
}

export class HttpExternalApi implements ExternalApiPort {
    constructor(private readonly apiUrl: string) {}

    async sendMedicalInfo(info: MedicalInfo & { documentId: string }): Promise<any> {
        try {
            const transformedData = {
                patientFirstname: info.patientFirstName,
                patientLastname: info.patientLastName,
                medicalExamination: info.examinationType,
                examinationDate: info.examinationDate,
                patientBirthDate: info.patientBirthdate,
                documentId: info.documentId,
                status: info.status
            };

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(transformedData)
            });
    
            if (!response.ok) {
                throw new Error(`External API error: ${response.statusText}`);
            }
    
            return response.json();
        } catch (error) {
            logger({
                message: 'Error sending medical info',
                context: error
            }).error();
            throw error;
        }
    }
}