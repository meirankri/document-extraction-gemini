import { Pool } from "mysql2/promise";
import { ExaminationType, DocumentCategory } from "../../domain/models";
import {
  ExaminationTypeRepository,
  DocumentCategoryRepository,
} from "../../domain/ports";
import { slugify } from "../../utils/format";

export class MySqlExaminationTypeRepository
  implements ExaminationTypeRepository
{
  constructor(private readonly pool: Pool) {}

  async findByName(name: string): Promise<ExaminationType | null> {
    const formattedSearchName = slugify(name);
    const [rows] = await this.pool.execute<ExaminationType[]>(
      `SELECT mt.* FROM medicalType mt 
            INNER JOIN coordonance c ON c.typeID = mt.id 
            WHERE LOWER(c.name) = LOWER(?) limit 1`,
      [formattedSearchName]
    );

    return rows[0] || null;
  }
}

export class MySqlDocumentCategoryRepository
  implements DocumentCategoryRepository
{
  constructor(private readonly pool: Pool) {}

  async findAll(): Promise<DocumentCategory[]> {
    const [rows] = await this.pool.execute<DocumentCategory[]>(
      `SELECT * FROM documentCategory`
    );
    return rows;
  }

  async findByName(name: string): Promise<DocumentCategory | null> {
    const [rows] = await this.pool.execute<DocumentCategory[]>(
      `SELECT * FROM documentCategory WHERE name = ?`,
      [name]
    );
    return rows[0] || null;
  }
}
