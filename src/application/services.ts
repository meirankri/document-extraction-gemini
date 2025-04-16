import { logger } from "../utils/logger";
import { Document, MedicalInfo } from "../domain/models";
import {
  ProcessDocumentUseCase,
  DocumentExtractor,
  ExaminationTypeRepository,
  NotificationPort,
  DocumentCategoryRepository,
  CategoryDetector,
} from "../domain/ports";

export class DocumentProcessingService implements ProcessDocumentUseCase {
  constructor(
    private readonly documentExtractor: DocumentExtractor,
    private readonly examinationTypeRepository: ExaminationTypeRepository,
    private readonly notificationService: NotificationPort,
    private readonly categoryDetector?: CategoryDetector,
    private readonly documentCategoryRepository?: DocumentCategoryRepository
  ) {}

  async execute(document: Document): Promise<MedicalInfo> {
    let customPrompt: string | undefined;
    let systemPrompt: string | undefined;
    let usedCategory = "default"; // Valeur par défaut

    if (this.categoryDetector && this.documentCategoryRepository) {
      try {
        // Récupération de toutes les catégories
        const categories = await this.documentCategoryRepository.findAll();
        const categoryNames = categories.map((cat) => cat.name);

        // Récupération du prompt système global
        try {
          const systemCategory =
            await this.documentCategoryRepository.findByName("system_prompt");
          if (systemCategory) {
            systemPrompt = systemCategory.prompt;
          }
        } catch (error) {
          logger({
            message: "Error while getting system prompt",
            context: error,
          }).error();
        }

        // Détection de la catégorie du document
        const detectionResult = await this.categoryDetector.detectCategory(
          document,
          categoryNames
        );
        logger({
          message: "Catégorie détectée",
          context: detectionResult,
        }).info();

        // Si une catégorie a été détectée, on récupère le prompt correspondant
        if (!detectionResult.no_category && detectionResult.category) {
          const category = await this.documentCategoryRepository.findByName(
            detectionResult.category
          );
          if (category) {
            customPrompt = category.prompt;
            usedCategory = category.name; // On enregistre la catégorie utilisée
            logger({
              message: "Utilisation d'un prompt personnalisé pour la catégorie",
              context: category.name,
            }).info();
          }
        }
      } catch (error) {
        logger({
          message: "Erreur lors de la détection de catégorie",
          context: error,
        }).error();
        // On continue avec le prompt par défaut
      }
    }

    // Combinaison du prompt système avec le prompt personnalisé si disponibles
    let finalPrompt = customPrompt;
    if (systemPrompt) {
      finalPrompt = systemPrompt + (customPrompt ? "\n\n" + customPrompt : "");
    }

    // Extraction des informations avec le prompt combiné ou par défaut
    const medicalInfo = await this.documentExtractor.extract(
      document,
      finalPrompt
    );

    const validation = this.validateInformation(medicalInfo);

    if (!validation.isValid) {
      try {
        await this.notificationService.notifyMissingInformation(
          document.id,
          validation.missingFields,
          { ...medicalInfo, usedCategory }, // Ajout de la catégorie dans la notification
          {
            filename: "document.pdf",
            content: document.content,
          }
        );
      } catch (error) {
        logger({
          message: "Error sending notification",
          context: error,
        }).error();
      }

      return {
        ...medicalInfo,
        status: 2,
        folderName: "",
        missingInformation: validation.missingFields,
        usedCategory, // Ajout de la catégorie dans l'objet de retour
      };
    }

    const examinationType = await this.examinationTypeRepository.findByName(
      medicalInfo.examinationType
    );

    if (!examinationType) {
      await this.notificationService.notifyMissingInformation(
        document.id,
        ["Invalid examination type"],
        { ...medicalInfo, usedCategory }, // Ajout de la catégorie dans la notification
        {
          filename: "document.pdf",
          content: document.content,
        }
      );
      return { ...medicalInfo, status: 2, folderName: "", usedCategory };
    }

    return {
      ...medicalInfo,
      folderName: examinationType.name,
      status: 1,
      usedCategory, // Ajout de la catégorie dans l'objet de retour réussi
    };
  }

  private validateInformation(info: Partial<MedicalInfo>): {
    isValid: boolean;
    missingFields: string[];
  } {
    const requiredFields: (keyof MedicalInfo)[] = [
      "patientFirstName",
      "patientLastName",
      "patientBirthdate",
      "examinationDate",
      "examinationType",
    ];

    const missingFields = requiredFields.filter((field) => !info[field]);

    return {
      isValid: missingFields.length === 0,
      missingFields,
    };
  }
}
