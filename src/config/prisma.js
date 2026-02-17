
import db from './database.js';

// Mapping des modèles (singulier) vers les tables SQL (pluriel)
const TABLE_MAP = {
  utilisateur: 'utilisateurs',
  portfolio: 'portfolios',
  projet: 'projets',
  experience: 'experiences',
  competence: 'competences',
  visite: 'visites',
  paiement: 'paiements',
  invoice: 'invoices',
  lien_social: 'liens_sociaux',
  session: 'sessions',
  refresh_token: 'refresh_tokens',
  role: 'roles',
  permission: 'permissions',
  role_permission: 'role_permissions'
};

const getTableName = (model) => {
  const name = model.toLowerCase();
  return TABLE_MAP[name] || name;
};

const sql = {
  whereClause(where = {}) {
    const keys = Object.keys(where);
    if (keys.length === 0) return { clause: '', values: [] };
    const parts = keys.map(k => `\`${k}\` = ?`);
    const values = keys.map(k => where[k]);
    return { clause: `WHERE ${parts.join(' AND ')}`, values };
  },
  
  async single(table, where) {
    const realTable = getTableName(table);
    const { clause, values } = this.whereClause(where);
    const [rows] = await db.query(`SELECT * FROM \`${realTable}\` ${clause} LIMIT 1`, values);
    return rows[0] || null;
  },
  
  async many(table, where, opts = {}) {
    const realTable = getTableName(table);
    const { clause, values } = this.whereClause(where);
    let q = `SELECT * FROM \`${realTable}\` ${clause}`;
    
    if (opts.orderBy) {
      const orderEntries = Object.entries(opts.orderBy);
      if (orderEntries.length > 0) {
        const [col, dir] = orderEntries[0];
        q += ` ORDER BY \`${col}\` ${dir.toUpperCase()}`;
      }
    }
    
    if (opts.take) {
      q += ` LIMIT ${Number(opts.take)}`;
    }
    
    const [rows] = await db.query(q, values);
    return rows;
  },
  
  async insert(table, data) {
    const realTable = getTableName(table);
    const keys = Object.keys(data);
    const values = keys.map(k => data[k]);
    const placeholders = keys.map(() => '?').join(', ');
    const q = `INSERT INTO \`${realTable}\` (${keys.map(k => `\`${k}\``).join(',')}) VALUES (${placeholders})`;
    
    const [result] = await db.query(q, values);
    
    const filterId = data.id || result.insertId;
    if (filterId) {
      const [rows] = await db.query(`SELECT * FROM \`${realTable}\` WHERE id = ? LIMIT 1`, [filterId]);
      return rows[0] || null;
    }
    return result;
  },
  
  async update(table, where, data) {
    const realTable = getTableName(table);
    const whereKeys = Object.keys(where);
    if (whereKeys.length === 0) throw new Error('Update requires a where clause');
    
    const setKeys = Object.keys(data);
    const setParts = setKeys.map(k => `\`${k}\` = ?`).join(', ');
    const whereParts = whereKeys.map(k => `\`${k}\` = ?`).join(' AND ');
    const values = [...setKeys.map(k => data[k]), ...whereKeys.map(k => where[k])];
    
    await db.query(`UPDATE \`${realTable}\` SET ${setParts} WHERE ${whereParts}`, values);
    
    const [rows] = await db.query(`SELECT * FROM \`${realTable}\` WHERE ${whereParts} LIMIT 1`, whereKeys.map(k => where[k]));
    return rows[0] || null;
  },

  async delete(table, where) {
    const realTable = getTableName(table);
    const { clause, values } = this.whereClause(where);
    if (!clause) throw new Error('Delete requires a where clause');
    return db.query(`DELETE FROM \`${realTable}\` ${clause}`, values);
  },
  
  async count(table, where = {}) {
    const realTable = getTableName(table);
    const { clause, values } = this.whereClause(where);
    const [rows] = await db.query(`SELECT COUNT(*) as count FROM \`${realTable}\` ${clause}`, values);
    return rows[0].count || 0;
  }
};

const handler = {
  get(_, prop) {
    if (prop === '$disconnect') {
      return async () => {
        try { await db.end(); } catch (e) { /* ignore */ }
      };
    }
    
    const modelName = prop;
    return {
      findUnique: async ({ where } = {}) => sql.single(modelName, where),
      findFirst: async ({ where } = {}) => sql.single(modelName, where),
      findMany: async (opts = {}) => sql.many(modelName, opts.where || {}, opts),
      create: async ({ data } = {}) => sql.insert(modelName, data || {}),
      update: async ({ where, data } = {}) => sql.update(modelName, where || {}, data || {}),
      delete: async ({ where } = {}) => sql.delete(modelName, where || {}),
      count: async ({ where } = {}) => sql.count(modelName, where || {}),
      aggregate: async ({ _sum } = {}, opts = {}) => {
        if (_sum) {
          const col = Object.keys(_sum)[0];
          const [rows] = await db.query(`SELECT SUM(\`${col}\`) as sum FROM \`${getTableName(modelName)}\` ${sql.whereClause(opts.where || {}).clause}`, sql.whereClause(opts.where || {}).values);
          return { _sum: { [col]: rows[0].sum || 0 } };
        }
        return {};
      }
    };
  }
};

const prisma = new Proxy({}, handler);

export default prisma;
