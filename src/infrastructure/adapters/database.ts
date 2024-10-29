import { Pool } from 'mysql2/promise';
import { ExaminationType } from '../../domain/models';
import { ExaminationTypeRepository } from '../../domain/ports';
import { slugify } from '../../utils/format';

export class MySqlExaminationTypeRepository implements ExaminationTypeRepository {
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