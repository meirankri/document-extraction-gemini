import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { Document, MedicalInfo } from "../../domain/models";
import {
  DocumentExtractor,
  ExternalApiPort,
  CategoryDetector,
} from "../../domain/ports";
import { logger } from "../../utils/logger";
import { PdfService } from "../services/pdfService";

export class GeminiDocumentExtractor implements DocumentExtractor {
  private readonly genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async extract(
    document: Document,
    customPrompt?: string
  ): Promise<Omit<MedicalInfo, "status" | "folderName">> {
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
        temperature: 0.0,
        topP: 1.0,
        topK: 1,
        maxOutputTokens: 8192,
      },
    });

    const defaultPrompt = `
        Reflechi avant de répondre.

        ## Objectif
        Extraire les informations structurées d'un document médical scanné et les retourner au format JSON standardisé.

        ## Informations à extraire
        1. Informations patient :
            - patientFirstName : Prénom du patient
            - patientLastName : Nom de famille du patient
            - patientGender : Sexe du patient (M ou F uniquement)
            - patientBirthdate : Date de naissance (format DD/MM/YYYY)
            - examinationDate : Date de l'examen (format DD/MM/YYYY)
            - examinationType : Type d'examen

        ## Règles de reconnaissance et extraction

        ### Types de documents et spécialités
        Identifier la catégorie principale du document parmi :
        - ORDONNANCES
        - CHIRURGIE
        - CONSULTATION
        - HOSPITALISATION
        - ORDONNANCE - BILAN

        ### Règles spécifiques pour examinationType
        1. Si "Résultats de biologie" → "Analyses Sanguines"
        2. Pour les autres cas → Conserver l'intitulé original

        ### Indices de localisation
        - examinationType : Généralement centré en haut du document
        - Dates : Chercher les mentions "Date de naissance", "Date d'examen", "Né(e) le"
        - Genre : Identifier "Homme"/"Femme" ou H/F
        - Spécialité : Analyser l'en-tête et le contenu pour identifier le service médical

        ## Format de sortie JSON
        {
            "patientFirstName": "Jean",
            "patientLastName": "Dupont",
            "patientGender": "M",
            "patientBirthdate": "15/03/1985",
            "examinationDate": "20/12/2024",
            "examinationType": "Analyses Sanguines",
        }

        ## Règles de gestion des valeurs manquantes
        - Informations non trouvées → ""
        - Dates non trouvées → "
        - Genre non identifié → ""

        ## Priorités de reconnaissance
        1. Privilégier le texte formaté et clairement identifiable
        2. Rechercher les informations dans l'en-tête du document
        3. Analyser le corps du document pour les informations manquantes
        4. Vérifier la cohérence entre le type de document et la spécialité médicale

        ## Validation des données
        1. Vérifier la cohérence des dates (format et validité)
        2. Contrôler que le genre est bien M ou F
        3. S'assurer que la spécialité correspond aux catégories définies
                                    `;

    const prompt = customPrompt
      ? `${customPrompt} 
      ## Format de sortie JSON
        {
            "patientFirstName": "Jean",
            "patientLastName": "Dupont",
            "patientGender": "M",
            "patientBirthdate": "15/03/1985",
            "examinationDate": "20/12/2024",
            "examinationType": "Analyses Sanguines",
        }

        ## Règles de gestion des valeurs manquantes
        - Informations non trouvées → ""
        - Dates non trouvées → "
        - Genre non identifié → ""

        ## Priorités de reconnaissance
        1. Privilégier le texte formaté et clairement identifiable
        2. Rechercher les informations dans l'en-tête du document
        3. Analyser le corps du document pour les informations manquantes
        4. Vérifier la cohérence entre le type de document et la spécialité médicale

        ## Validation des données
        1. Vérifier la cohérence des dates (format et validité)
        2. Contrôler que le genre est bien M ou F
        3. S'assurer que la spécialité correspond aux catégories définies
      `
      : defaultPrompt;

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

    const json = JSON.parse(jsonMatch[0]);

    const medicalInfo = {
      patientFirstName: json.patientFirstName,
      patientLastName: json.patientLastName,
      patientGender: json.patientGender,
      patientBirthdate: json.patientBirthdate,
      examinationDate: json.examinationDate,
      examinationType: json.examinationType.trim().replace(/\n/g, " "), // remplace tous les sauts de ligne
    };

    return medicalInfo;
  }
}

export class GeminiCategoryDetector implements CategoryDetector {
  private readonly genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async detectCategory(
    document: Document,
    categories: string[]
  ): Promise<{ category: string; no_category: boolean }> {
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
        temperature: 0.2,
        topP: 0.95,
        topK: 64,
        maxOutputTokens: 8192,
      },
    });

    // Extraire uniquement la première page si c'est un PDF
    let documentContent = document.content;
    if (document.mimeType === "application/pdf") {
      try {
        documentContent = await PdfService.extractFirstPage(document.content);
        logger({
          message:
            "Première page extraite avec succès pour la détection de catégorie",
        }).info();
      } catch (error) {
        logger({
          message:
            "Erreur lors de l'extraction de la première page, utilisation du document complet",
          context: error,
        }).error();
      }
    }

    const categoriesStr = categories.join(", ");
    const prompt = `
    Examine la première page de ce document médical et détermine à quelle catégorie il appartient parmi la liste suivante: ${categoriesStr}.
    
    Si le document ne correspond à aucune des catégories listées, indique "no_category: true".
    
    Réponds uniquement avec un objet JSON au format:
    {
      "category": "nom_de_la_catégorie",
      "no_category": false
    }
    
    Si aucune catégorie ne correspond:
    {
      "category": "",
      "no_category": true
    }
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: documentContent.toString("base64"),
          mimeType: document.mimeType,
        },
      },
    ]);

    const response = result.response;
    const text = response.text();
    console.log("category detection result:", text);

    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error(
        "Aucun JSON valide trouvé dans la réponse de détection de catégorie"
      );
    }

    const json = JSON.parse(jsonMatch[0]);
    return {
      category: json.category || "",
      no_category: json.no_category === true,
    };
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
