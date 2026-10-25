/**
 * Base de datos simulada para las pruebas unitarias de los servicios.
 *
 * Cada modelo se compila con el esquema real sobre una instancia de Mongoose que nunca se conecta:
 * los documentos tienen los mismos valores por defecto, validaciones, `id` y `toJSON` que en
 * producción, pero se guardan en memoria. Las consultas soportan el subconjunto de operadores que
 * usa el backend ($in, $nin, $ne, $exists, $gt, $gte, $lt, $lte, $or, $and y, en las
 * actualizaciones, $set, $inc, $push y $setOnInsert). No reemplaza a las pruebas de integración,
 * que corren contra MongoDB.
 */
import mongoose, { Model, Schema } from 'mongoose';

type Doc = mongoose.Document & Record<string, unknown>;
type Filter = Record<string, unknown>;

export interface FakeModel<T = unknown> extends Model<T> {
  /** Documentos guardados (solo los de este modelo, si es un discriminador). */
  docs(): Doc[];
  /** Vacía la colección. */
  reset(): void;
}

const norm = (v: unknown): unknown => {
  if (v instanceof Date) return v.getTime();
  if (
    v &&
    typeof v === 'object' &&
    typeof (v as { toHexString?: unknown }).toHexString === 'function'
  ) {
    return (v as { toHexString: () => string }).toHexString();
  }
  return v;
};

function valueAt(doc: unknown, path: string): unknown {
  if (path === 'id') path = '_id';
  let current: unknown = doc;
  for (const key of path.split('.')) {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      return current.map((item) => valueAt(item, key)).flat();
    }
    const getter = (current as { get?: (k: string) => unknown }).get;
    current =
      typeof getter === 'function' && current instanceof mongoose.Document
        ? getter.call(current, key)
        : (current as Record<string, unknown>)[key];
  }
  return current;
}

function equals(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual) && !Array.isArray(expected)) {
    return actual.some((item) => equals(item, expected));
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return (
      actual.length === expected.length &&
      actual.every((item, i) => equals(item, expected[i]))
    );
  }
  return norm(actual) === norm(expected);
}

function compare(actual: unknown, op: string, expected: unknown): boolean {
  const a = norm(actual) as number;
  const b = norm(expected) as number;
  if (actual === undefined || actual === null) return false;
  switch (op) {
    case '$gt':
      return a > b;
    case '$gte':
      return a >= b;
    case '$lt':
      return a < b;
    default:
      return a <= b;
  }
}

function matchesCondition(actual: unknown, condition: unknown): boolean {
  if (condition instanceof RegExp) {
    const values = Array.isArray(actual) ? actual : [actual];
    return values.some((v) => typeof v === 'string' && condition.test(v));
  }
  const isOperatorObject =
    condition !== null &&
    typeof condition === 'object' &&
    !(condition instanceof Date) &&
    !Array.isArray(condition) &&
    Object.keys(condition).length > 0 &&
    Object.keys(condition).every((k) => k.startsWith('$'));
  if (!isOperatorObject) return equals(actual, condition);
  return Object.entries(condition as Record<string, unknown>).every(
    ([op, expected]) => {
      switch (op) {
        case '$in':
          return (expected as unknown[]).some((e) => equals(actual, e));
        case '$nin':
          return !(expected as unknown[]).some((e) => equals(actual, e));
        case '$ne':
          return !equals(actual, expected);
        case '$exists': {
          const present =
            actual !== undefined &&
            !(Array.isArray(actual) && actual.length === 0 && false);
          return expected
            ? present && actual !== undefined
            : actual === undefined;
        }
        case '$gt':
        case '$gte':
        case '$lt':
        case '$lte':
          return compare(actual, op, expected);
        default:
          throw new Error(`Operador no soportado por la base simulada: ${op}`);
      }
    },
  );
}

export function matches(doc: unknown, filter: Filter = {}): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$or')
      return (condition as Filter[]).some((f) => matches(doc, f));
    if (key === '$and')
      return (condition as Filter[]).every((f) => matches(doc, f));
    return matchesCondition(valueAt(doc, key), condition);
  });
}

function sortDocs(
  docs: Doc[],
  spec: Record<string, 1 | -1 | 'asc' | 'desc'>,
): Doc[] {
  const entries = Object.entries(spec);
  return [...docs].sort((x, y) => {
    for (const [key, dir] of entries) {
      const a = norm(valueAt(x, key)) as number;
      const b = norm(valueAt(y, key)) as number;
      if (a === b) continue;
      const sign = dir === -1 || dir === 'desc' ? -1 : 1;
      if (a === undefined) return 1;
      if (b === undefined) return -1;
      return a < b ? -sign : sign;
    }
    return 0;
  });
}

/** Consulta encadenable (sort, select, lean, limit) que se resuelve con exec() o con await. */
class FakeQuery<R> implements PromiseLike<R> {
  private sortSpec?: Record<string, 1 | -1>;
  private isLean = false;
  private max?: number;

  constructor(private readonly resolve: () => R) {}

  sort(spec: Record<string, 1 | -1>): this {
    this.sortSpec = spec;
    return this;
  }
  select(): this {
    return this;
  }
  populate(): this {
    return this;
  }
  limit(n: number): this {
    this.max = n;
    return this;
  }
  lean(): this {
    this.isLean = true;
    return this;
  }
  exec(): Promise<R> {
    let result = this.resolve() as unknown;
    if (Array.isArray(result)) {
      if (this.sortSpec) result = sortDocs(result as Doc[], this.sortSpec);
      if (this.max !== undefined) result = (result as Doc[]).slice(0, this.max);
      if (this.isLean)
        result = (result as Doc[]).map((d) => d.toObject() as unknown);
    } else if (this.isLean && result instanceof mongoose.Document) {
      result = result.toObject() as unknown;
    }
    return Promise.resolve(result as R);
  }
  then<A = R, B = never>(
    onfulfilled?: ((value: R) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

function applyUpdate(
  doc: Doc,
  update: Record<string, unknown>,
  inserting: boolean,
): void {
  const hasOperators = Object.keys(update).some((k) => k.startsWith('$'));
  if (!hasOperators) {
    for (const [k, v] of Object.entries(update)) doc.set(k, v);
    return;
  }
  for (const [op, fields] of Object.entries(update)) {
    for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
      switch (op) {
        case '$set':
          doc.set(k, v);
          break;
        case '$setOnInsert':
          if (inserting) doc.set(k, v);
          break;
        case '$inc':
          doc.set(k, ((doc.get(k) as number) ?? 0) + (v as number));
          break;
        case '$push':
          (doc.get(k) as unknown[]).push(v);
          break;
        default:
          throw new Error(`Operador de actualización no soportado: ${op}`);
      }
    }
  }
}

function seedFromFilter(filter: Filter): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(filter).filter(
      ([k, v]) => !k.startsWith('$') && (typeof v !== 'object' || v === null),
    ),
  );
}

function install(
  model: Model<unknown>,
  all: Doc[],
  own: (d: Doc) => boolean,
): FakeModel {
  const m = model as unknown as FakeModel & Record<string, unknown>;
  const proto = m.prototype as Record<string, unknown>;
  const scope = () => all.filter(own);
  const find = (filter?: Filter) => scope().filter((d) => matches(d, filter));

  proto.save = async function save(this: Doc) {
    await this.validate();
    if (!all.includes(this)) all.push(this);
    this.isNew = false;
    return this;
  };
  proto.deleteOne = function deleteOne(this: Doc) {
    const i = all.indexOf(this);
    if (i >= 0) all.splice(i, 1);
    return new FakeQuery(() => ({ deletedCount: i >= 0 ? 1 : 0 }));
  };

  m.docs = scope;
  m.reset = () => {
    for (const d of scope()) all.splice(all.indexOf(d), 1);
  };
  m.find = ((filter?: Filter) => new FakeQuery(() => find(filter))) as never;
  m.findOne = ((filter?: Filter) =>
    new FakeQuery(() => find(filter)[0] ?? null)) as never;
  m.findById = ((id: unknown) =>
    new FakeQuery(
      () => scope().find((d) => String(d._id) === String(id)) ?? null,
    )) as never;
  m.exists = ((filter?: Filter) =>
    new FakeQuery(() => {
      const d = find(filter)[0];
      return d ? { _id: d._id } : null;
    })) as never;
  m.countDocuments = ((filter?: Filter) =>
    new FakeQuery(() => find(filter).length)) as never;
  m.distinct = ((field: string, filter?: Filter) =>
    new FakeQuery(() => {
      const values = find(filter).flatMap((d) => {
        const v = valueAt(d, field);
        return Array.isArray(v) ? (v as unknown[]) : [v];
      });
      const seen = new Map<unknown, unknown>();
      for (const v of values) if (v !== undefined) seen.set(norm(v), v);
      return [...seen.values()];
    })) as never;
  m.create = (async (input: unknown) => {
    const many = Array.isArray(input);
    const docs: Doc[] = [];
    for (const data of (many ? input : [input]) as Record<string, unknown>[]) {
      const doc = new m(data) as unknown as Doc;
      await doc.save();
      docs.push(doc);
    }
    return many ? docs : docs[0];
  }) as never;
  m.insertMany = ((input: unknown[]) => m.create(input as never)) as never;
  m.deleteMany = ((filter?: Filter) =>
    new FakeQuery(() => {
      const gone = find(filter);
      for (const d of gone) all.splice(all.indexOf(d), 1);
      return { deletedCount: gone.length };
    })) as never;
  m.deleteOne = ((filter?: Filter) =>
    new FakeQuery(() => {
      const d = find(filter)[0];
      if (d) all.splice(all.indexOf(d), 1);
      return { deletedCount: d ? 1 : 0 };
    })) as never;
  const updateWith =
    (multi: boolean) =>
    (
      filter: Filter,
      update: Record<string, unknown>,
      opts?: { upsert?: boolean },
    ) =>
      new FakeQuery(async () => {
        const targets = multi ? find(filter) : find(filter).slice(0, 1);
        for (const d of targets) applyUpdate(d, update, false);
        await Promise.all(targets.map((d) => d.save()));
        if (targets.length === 0 && opts?.upsert) {
          const doc = new m(seedFromFilter(filter)) as unknown as Doc;
          applyUpdate(doc, update, true);
          await doc.save();
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        }
        return { matchedCount: targets.length, modifiedCount: targets.length };
      });
  m.updateOne = updateWith(false) as never;
  m.updateMany = updateWith(true) as never;
  m.findOneAndUpdate = ((
    filter: Filter,
    update: Record<string, unknown>,
    opts?: {
      upsert?: boolean;
      new?: boolean;
      returnDocument?: 'after' | 'before';
    },
  ) =>
    new FakeQuery(async () => {
      let doc = find(filter)[0];
      const after = opts?.new || opts?.returnDocument === 'after';
      if (!doc) {
        if (!opts?.upsert) return null;
        doc = new m(seedFromFilter(filter)) as unknown as Doc;
        applyUpdate(doc, update, true);
        await doc.save();
        return after ? doc : null;
      }
      const before = doc.toObject() as unknown;
      applyUpdate(doc, update, false);
      await doc.save();
      return after ? doc : before;
    })) as never;
  m.findByIdAndUpdate = ((
    id: unknown,
    update: Record<string, unknown>,
    opts?: { new?: boolean },
  ) =>
    m.findOneAndUpdate({ _id: id } as never, update, {
      ...opts,
    } as never)) as never;
  return m;
}

/** Base simulada: agrupa las colecciones y permite discriminadores que comparten colección. */
export class FakeDb {
  private readonly mongoose = new mongoose.Mongoose();
  private readonly collections = new Map<string, Doc[]>();

  model<T>(name: string, schema: Schema): FakeModel<T> {
    const model = this.mongoose.model(name, schema.clone());
    const all: Doc[] = [];
    this.collections.set(name, all);
    return install(
      model as unknown as Model<unknown>,
      all,
      () => true,
    ) as unknown as FakeModel<T>;
  }

  discriminator<T>(
    base: FakeModel<never>,
    name: string,
    schema: Schema,
    value: string,
  ): FakeModel<T> {
    const baseModel = base as unknown as Model<unknown>;
    const schemaOfBase = (base as unknown as { schema: Schema }).schema;
    const options = schemaOfBase.options as { discriminatorKey?: string };
    const key = options.discriminatorKey ?? '__t';
    const all = this.collections.get(baseModel.modelName) as Doc[];
    const model = baseModel.discriminator(
      name,
      schema.clone(),
      value,
    ) as unknown as Model<unknown>;
    return install(
      model,
      all,
      (d) => d.get(key) === value,
    ) as unknown as FakeModel<T>;
  }

  reset(): void {
    for (const all of this.collections.values()) all.length = 0;
  }
}
