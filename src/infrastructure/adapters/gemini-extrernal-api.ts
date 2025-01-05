import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { Document, MedicalInfo } from "../../domain/models";
import { DocumentExtractor, ExternalApiPort } from "../../domain/ports";
import { logger } from "../../utils/logger";

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
        },
      ],
      generationConfig: {
        temperature: 1,
        topP: 0.95,
        topK: 64,
        maxOutputTokens: 8192,
      },
    });

    const prompt = `Extrait les informations suivantes d'un document médical scanné et retourne-les sous format JSON :
                patientFirstName : Le prénom du patient.
                patientLastName : Le nom de famille du patient.
                patientGender : Le sexe du patient (M ou F uniquement).
                patientBirthdate : La date de naissance du patient au format DD/MM/YYYY.
                examinationDate : La date de l'examen médical au format DD/MM/YYYY.
                examinationType : Le type d'examen.
                Si le type d'examen est lié à des "Résultats de biologie", retourne "Analyses Sanguines".
                Sinon, retourne le type d'examen tel quel.
                Conventions et indices pour extraire les données :

                Le examinationType est généralement centré et situé en haut du document, sans titre explicite le précédant. Il correspond au titre que donnerait un médecin à ce document.
                Les dates, lorsqu'elles sont présentes, sont souvent associées à des termes comme "Date de naissance", "Date d'examen" ou "Né(e) le".
                Le sexe peut être identifié par des mentions comme "Homme", "Femme", ou des abréviations équivalentes (H/F).
                Privilégier les informations formatées en texte brut ou clairement identifiables.
                Exemple de sortie au format JSON :

                json
                {
                    "patientFirstName": "Jean",
                    "patientLastName": "Dupont",
                    "patientGender": "M",
                    "patientBirthdate": "15/03/1985",
                    "examinationDate": "20/12/2024",
                    "examinationType": "Analyses Sanguines"
                }
                Si certaines informations sont absentes ou non détectables, les valeurs retournées doivent être nulles ou une chaîne vide ("").
                            `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: document.content.toString("base64"),
          mimeType: document.mimeType,
        },
      },
    ]);

    const response = result.response;
    const text = response.text();
    console.log("result ai", text);

    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Aucun JSON valide trouvé dans la réponse");
    }

    return JSON.parse(jsonMatch[0]);
  }
}

export class HttpExternalApi implements ExternalApiPort {
  constructor(private readonly apiUrl: string) {}

  async sendMedicalInfo(
    info: MedicalInfo & { documentId: string }
  ): Promise<any> {
    try {
      const transformedData = {
        patientFirstname: info.patientFirstName,
        patientLastname: info.patientLastName,
        medicalExamination: info.examinationType,
        examinationDate: info.examinationDate,
        patientBirthDate: info.patientBirthdate,
        documentId: info.documentId,
        status: info.status,
      };

      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(transformedData),
      });

      if (!response.ok) {
        throw new Error(`External API error: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      logger({
        message: "Error sending medical info",
        context: error,
      }).error();
      throw error;
    }
  }
}
