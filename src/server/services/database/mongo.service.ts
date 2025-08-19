// mongo-service.ts
import mongoose, {
  Model,
  Schema,
  type SchemaDefinition,
  type SchemaOptions,
  type FilterQuery,
  type ProjectionType,
  type QueryOptions,
  type PipelineStage,
  type ClientSession,
  type HydratedDocument,
  type IndexDefinition,
  type IndexOptions,
} from 'mongoose';
import { EntityList, Pagination } from '@models';

const DEFAULT_PAGE_SIZE = 20;

type UniqueFlag = boolean | [true, string]; // [true, 'index_name']

type IndexSpec = {
  fields: IndexDefinition;
  options?: Omit<IndexOptions, 'unique'> & { unique?: UniqueFlag };
};

type MongoServiceOpts = {
  /** Additional schema-level indexes to add */
  indexes?: IndexSpec | IndexSpec[];
  /** Call createIndexes() after model creation (default: true) */
  autoCreateIndexes?: boolean;
  /** Pre-save middleware functions to apply to the schema */
  preSave?: ((doc: any) => void | Promise<void>) | ((doc: any) => void | Promise<void>)[];
};

function sanitizePage(page?: Pagination): Required<Pick<Pagination, 'pageSize' | 'pageIndex'>> & Pick<Pagination, 'pageSort'> {
  const pageSize = Math.max(1, page?.pageSize ?? DEFAULT_PAGE_SIZE);
  const pageIndex = Math.max(0, page?.pageIndex ?? 0);
  const pageSort = page?.pageSort && Object.keys(page.pageSort).length ? page.pageSort : undefined;
  return { pageSize, pageIndex, pageSort };
}

function applyIndexes<T>(schema: Schema<T>, specs?: IndexSpec | IndexSpec[]) {
  if (!specs) return;
  const list = Array.isArray(specs) ? specs : [specs];
  for (const spec of list) {
    const { fields, options } = spec;

    let idxOpts: IndexOptions | undefined;

    if (options) {
      // normalize unique?: boolean | [true, name]
      const { unique, ...rest } = (options as IndexSpec['options']) || {};

      idxOpts = { ...rest } as IndexOptions;

      if (Array.isArray(unique)) {
        const [flag, name] = unique as [true, string];
        if (flag) idxOpts.unique = true;
        if (name) idxOpts.name ??= name;
      } else if (typeof unique === 'boolean') {
        idxOpts.unique = unique;
      }
    }
    schema.index(fields, idxOpts);
  }
}

function applyPreSaveMiddleware<T>(schema: Schema<T>, preSaveFns?: ((doc: any) => void | Promise<void>) | ((doc: any) => void | Promise<void>)[]) {
  if (!preSaveFns) return;

  const functions = Array.isArray(preSaveFns) ? preSaveFns : [preSaveFns];

  for (const fn of functions) {
    schema.pre('save', async function (next) {
      try {
        await fn(this);
        next();
      } catch (error) {
        next(error as Error);
      }
    });
  }
}

/**
 * Strongly-typed, thin wrapper over a Mongoose Model.
 * - Pass-throughs keep native Mongoose return types (Query / HydratedDocument).
 * - Adds `aggregatePaginated` that returns BaseRecords<TRow, TExtra>.
 * - New: accepts Schema or inline [definition, options], plus index specs.
 */
export class MongoService<TDoc extends object> {
  public readonly model: Model<TDoc>;

  // Pass-throughs
  public readonly find: Model<TDoc>['find'];
  public readonly findOne: Model<TDoc>['findOne'];
  public readonly findById: Model<TDoc>['findById'];
  public readonly countDocuments: Model<TDoc>['countDocuments'];
  public readonly distinct: Model<TDoc>['distinct'];
  public readonly create: (doc: Partial<TDoc>, options?: QueryOptions<TDoc>) => Promise<HydratedDocument<TDoc>>;
  public readonly insertOne: Model<TDoc>['insertOne'];
  public readonly insertMany: Model<TDoc>['insertMany'];
  public readonly updateOne: Model<TDoc>['updateOne'];
  public readonly updateMany: Model<TDoc>['updateMany'];
  public readonly findOneAndUpdate: Model<TDoc>['findOneAndUpdate'];
  public readonly findByIdAndUpdate: Model<TDoc>['findByIdAndUpdate'];
  public readonly deleteOne: Model<TDoc>['deleteOne'];
  public readonly deleteMany: Model<TDoc>['deleteMany'];
  public readonly findOneAndDelete: Model<TDoc>['findOneAndDelete'];
  public readonly findByIdAndDelete: Model<TDoc>['findByIdAndDelete'];

  constructor(
    name: string,
    schemaDefinition: SchemaDefinition<TDoc>,
    schemaOptions: SchemaOptions<TDoc>,
    optsOrIndex?: MongoServiceOpts | IndexSpec
  ) {
    const opts: MongoServiceOpts =
      optsOrIndex && 'fields' in (optsOrIndex as any) ? { indexes: optsOrIndex as IndexSpec } : ((optsOrIndex as MongoServiceOpts) ?? {});

    if (mongoose.models[name]) {
      // If model already compiled, reuse it (schema/index changes won’t apply here).
      this.model = mongoose.models[name] as Model<TDoc>;
    } else {
      const schema = new Schema(schemaDefinition, schemaOptions);
      applyIndexes(schema, opts.indexes);
      applyPreSaveMiddleware(schema, opts.preSave);
      this.model = mongoose.model<TDoc>(name, schema);

      if (opts.autoCreateIndexes !== false) {
        // Defer index creation until connection is ready
        const createIndexesWhenReady = async () => {
          try {
            // Wait for connection to be ready
            if (mongoose.connection.readyState !== 1) {
              await new Promise<void>((resolve) => {
                const checkConnection = () => {
                  if (mongoose.connection.readyState === 1) {
                    resolve();
                  } else {
                    setTimeout(checkConnection, 100);
                  }
                };
                checkConnection();
              });
            }
            await this.model.createIndexes();
          } catch (e: any) {
            console.warn(`[MongoService:${name}] createIndexes() failed:`, e?.message || e);
          }
        };

        // fire-and-forget
        void createIndexesWhenReady();
      }
    }

    // Bind pass-throughs
    this.find = this.model.find.bind(this.model);
    this.findOne = this.model.findOne.bind(this.model);
    this.findById = this.model.findById.bind(this.model);
    this.countDocuments = this.model.countDocuments.bind(this.model);
    this.distinct = this.model.distinct.bind(this.model);
    this.insertOne = this.model.insertOne.bind(this.model);
    this.insertMany = this.model.insertMany.bind(this.model);
    this.updateOne = this.model.updateOne.bind(this.model);
    this.updateMany = this.model.updateMany.bind(this.model);
    this.findOneAndUpdate = this.model.findOneAndUpdate.bind(this.model);
    this.findByIdAndUpdate = this.model.findByIdAndUpdate.bind(this.model);
    this.deleteOne = this.model.deleteOne.bind(this.model);
    this.deleteMany = this.model.deleteMany.bind(this.model);
    this.findOneAndDelete = this.model.findOneAndDelete.bind(this.model);
    this.findByIdAndDelete = this.model.findByIdAndDelete.bind(this.model);

    this.create = async (doc: Partial<TDoc>, options?: QueryOptions<TDoc>) => {
      const [created] = await this.model.create([doc], options);
      return created as HydratedDocument<TDoc>;
    };
  }

  /* ---------------- Lean helpers (typed) ---------------- */

  async findOneLean<TOut = TDoc>(
    filter: FilterQuery<TDoc>,
    projection?: ProjectionType<TDoc> | null,
    options?: QueryOptions<TDoc>
  ): Promise<TOut | null> {
    return this.model
      .findOne(filter, projection ?? undefined, options)
      .lean<TOut>()
      .exec();
  }

  async findLean<TOut = TDoc>(
    filter: FilterQuery<TDoc> = {},
    projection?: ProjectionType<TDoc> | null,
    options?: QueryOptions<TDoc>
  ): Promise<TOut[]> {
    return this.model
      .find(filter, projection ?? undefined, options)
      .lean<TOut[]>()
      .exec();
  }

  /* ---------------- Aggregate (typed) ---------------- */

  aggregate<TResult>(pipeline: ReadonlyArray<PipelineStage>, opts?: { allowDiskUse?: boolean; session?: ClientSession }): Promise<TResult[]> {
    const agg = this.model.aggregate<TResult>([...pipeline]);
    if (opts?.allowDiskUse) agg.allowDiskUse(true);
    if (opts?.session) agg.session(opts.session);
    return agg.exec();
  }

  async aggregatePaginated<TRow, TExtra extends object = Record<never, never>>(
    options: {
      page?: Pagination;
      allowDiskUse?: boolean;
      collation?: {
        locale: string;
        strength?: number;
        caseLevel?: boolean;
        caseFirst?: string;
        numericOrdering?: boolean;
        alternate?: string;
        maxVariable?: string;
        normalization?: boolean;
        backwards?: boolean;
      };
      project?: PipelineStage.Project['$project'];
      groupQuery?: Record<string, unknown>;
      session?: ClientSession | null;
      debug?: boolean;
    } = {},
    beforePipeline: ReadonlyArray<PipelineStage> = [],
    afterPipeline: ReadonlyArray<PipelineStage> = []
  ): Promise<EntityList<TRow> & TExtra> {
    const { pageSize, pageIndex, pageSort } = sanitizePage(options.page);

    const pipeline: PipelineStage[] = [
      ...(beforePipeline ?? []),
      {
        $facet: {
          data: [
            ...(pageSort ? [{ $sort: pageSort } as PipelineStage] : []),
            { $skip: pageIndex * pageSize } as PipelineStage,
            { $limit: pageSize } as PipelineStage,
            ...(afterPipeline ?? []),
            ...(options.project ? [{ $project: options.project } as PipelineStage] : []),
          ],
          info: [{ $group: { _id: null, totalItems: { $sum: 1 }, ...(options.groupQuery ?? {}) } } as PipelineStage],
        },
      } as PipelineStage,
      {
        $project: {
          data: 1,
          info: 1,
          total: { $ifNull: [{ $arrayElemAt: ['$info.totalItems', 0] }, 0] },
          extra: {
            $let: {
              vars: { i: { $ifNull: [{ $arrayElemAt: ['$info', 0] }, {}] } },
              in: {
                $setDifference: [
                  { $objectToArray: '$$i' },
                  [
                    { k: '_id', v: null },
                    { k: 'totalItems', v: null },
                  ],
                ],
              },
            },
          },
        },
      } as PipelineStage,
    ];

    if (options.debug) {
      console.debug('[aggregatePaginated] pipeline:', JSON.stringify(pipeline, null, 2));
    }

    const agg = this.model.aggregate<{
      data: TRow[];
      total: number;
      extra: Array<{ k: string; v: unknown }>;
    }>(pipeline);

    if (options.collation) agg.collation(options.collation);
    if (options.allowDiskUse) agg.allowDiskUse(true);
    if (options.session) agg.session(options.session);

    const [doc] = await agg.exec();

    const data: TRow[] = doc?.data ?? [];
    const totalItems: number = doc?.total ?? 0;

    const extraEntries = (doc?.extra ?? []).map(({ k, v }) => [k, v] as const);
    const extraObj = Object.fromEntries(extraEntries) as unknown as TExtra;

    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const hasMore = (pageIndex + 1) * pageSize < totalItems;

    const base: EntityList<TRow> = {
      data,
      totalItems,
      hasMore,
      pageIndex,
      pageSize,
      pageSort,
      totalPages,
    };

    return Object.assign(base, extraObj);
  }
}
