CREATE TABLE IF NOT EXISTS `documentCategory` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `prompt` TEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `idx_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insérer quelques catégories par défaut
INSERT INTO `documentCategory` (`name`, `prompt`) VALUES
('ordonnance', 'Ceci est un document d\'ordonnance médicale. Extrais toutes les informations patient et médicament avec précision. Fais particulièrement attention aux noms des médicaments et à la posologie.'),
('rapport_holter', 'Ce document est un rapport Holter cardiaque. Pour ce type de document, assure-toi de bien identifier le type d\'examen comme "Holter ECG" ou "Holter rythmique", et non pas comme "Rythme et conduction". Extrait également toutes les informations patient avec précision.'),
('analyse_sanguine', 'Ce document est une analyse de sang. Extrait les informations patient et assure-toi d\'identifier correctement le type d\'examen comme "Analyses Sanguines".'),
('echographie', 'Ce document est une échographie. Extrait avec précision les informations patient et identifie le type spécifique d\'échographie (cardiaque, abdominale, etc.).'); 