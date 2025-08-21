// mongo-service.ts
import mongoose, {
  AggregateOptions,
  type ClientSession,
  type FilterQuery,
  type HydratedDocument,
  type IndexDefinition,
  type IndexOptions,
  Model,
  type PipelineStage,
  type ProjectionType,
  type QueryOptions,
  Schema,
  type SchemaDefinition,
  type SchemaOptions,
} from 'mongoose';
import crypto from 'crypto';
import type { EntityList, Pagination } from '@models';
import { LRUCache } from 'lru-cache';

// URI will be evaluated when connect() is called, after environment variables are loaded
const DEFAULT_PAGE_SIZE = 20;

// Auto-reconnect configuration
const RECONNECT_CONFIG = {
  maxRetries: 10,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
};

type ExtendedQueryOptions<TDoc> = QueryOptions<TDoc> & { cacheEnabledFlag?: boolean };
type UniqueFlag = boolean | [true, string]; // [true, 'index_name']
type IndexSpec = { fields: IndexDefinition; options?: Omit<IndexOptions, 'unique'> & { unique?: UniqueFlag } };

type AggregatePaginatedOpts = {
  page?: Pagination;
  groupQuery?: Record<string, unknown>;
  session?: ClientSession | null;
  debug?: boolean;
} & AggregateOptions;

type MongoServiceOpts = {
  /** Additional schema-level indexes to add */
  indexes?: IndexSpec | IndexSpec[];
  /** Call createIndexes() after model creation (default: true) */
  autoCreateIndexes?: boolean;
  /** Pre-save middleware functions to apply to the schema */
  preSave?: ((doc: any) => void | Promise<void>) | ((doc: any) => void | Promise<void>)[];
  /** Cache configuration options */
  cacheOptions?: { max?: number; ttl?: number };
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

  // Static properties for auto-reconnect
  private readonly cache: LRUCache<string, any>;
  private static reconnectAttempts = 0;
  private static isReconnecting = false;

  // Pass-throughs
  public readonly find: Model<TDoc>['find'];
  public findOne: Model<TDoc>['findOne'];
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

    // Initialize cache
    this.cache = new LRUCache<string, any>({
      max: opts.cacheOptions?.max ?? 10000,
      ttl: opts.cacheOptions?.ttl ?? 1000 * 60 * 60, // 1 hour default
    });

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
    this.findOne = this.getCachedFindOne.bind(this);
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
    const result = await this.model
      .findOne(filter, projection ?? undefined, options)
      .lean<TOut>()
      .exec();
    return result;
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

  /* ---------------- Cached FindOne ---------------- */

  /**
   * Generate a cache key from filter, projection, and options
   */
  private generateCacheKey(...arg: any[]): string {
    return crypto.createHash('sha256').update(JSON.stringify(arg)).digest('hex');
  }

  /**
   * Invalidate cache entries for this model
   * Call this after updates/deletes to ensure cache consistency
   */
  invalidateCache(): void {
    this.cache.clear();
  }

  /**
   * Invalidate specific cache entries based on a filter pattern
   */
  invalidateCacheByFilter(filterPattern: Partial<FilterQuery<TDoc>>): void {
    const pattern = JSON.stringify(filterPattern);
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.cache.delete(key));
  }

  /**
   * Enhanced findOne method that supports caching via cacheEnabledFlag
   * Each call can decide whether to use cache or not
   */
  private getCachedFindOne(filter: FilterQuery<TDoc>, projection?: ProjectionType<TDoc> | null, options?: ExtendedQueryOptions<TDoc>) {
    const { cacheEnabledFlag, ...queryOptions } = options || {};

    // If cache is not enabled globally or for this specific query, use standard findOne
    if (!cacheEnabledFlag) {
      return this.model.findOne(filter, projection ?? undefined, queryOptions);
    }

    // Create a custom query that handles caching
    const query = this.model.findOne(filter, projection ?? undefined, queryOptions);

    // Override the exec method to add caching
    const originalExec = query.exec.bind(query);
    query.exec = async () => {
      const cacheKey = this.generateCacheKey(filter, projection, queryOptions);

      // Check cache first
      const cachedResult = this.cache.get(cacheKey);

      if (cachedResult !== undefined) {
        return cachedResult;
      }

      // If not in cache, execute the original query
      const result = await originalExec();

      // Cache the result (null results are also cached to avoid repeated DB calls)
      this.cache.set(cacheKey, result);

      return result;
    };

    return query as any;
  }

  /* ---------------- Aggregate (typed) ---------------- */

  aggregate<TResult>(pipeline: ReadonlyArray<PipelineStage>, opts?: { allowDiskUse?: boolean; session?: ClientSession }): Promise<TResult[]> {
    const agg = this.model.aggregate<TResult>([...pipeline]);
    if (opts?.allowDiskUse) agg.allowDiskUse(true);
    if (opts?.session) agg.session(opts.session);
    return agg.exec();
  }

  async pagination<TRow, TExtra extends object = Record<never, never>>(
    options: AggregatePaginatedOpts,
    beforePipeline: ReadonlyArray<PipelineStage>,
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

  /* ---------------- Static Connection Methods ---------------- */

  /**
   * Connect to MongoDB
   */
  static async connect(): Promise<void> {
    if (mongoose.connection.readyState === 1) {
      console.log('MongoDB already connected');
      return;
    }

    const uri = process.env.MONGO_RUI;
    if (!uri) {
      throw new Error('MONGO_RUI environment variable is not set');
    }

    try {
      await mongoose.connect(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferCommands: false,
      });

      console.log('✅ MongoDB connected successfully via MongoService');

      mongoose.connection.on('error', (error) => {
        console.error('MongoDB connection error:', error);
      });

      mongoose.connection.on('disconnected', () => {
        console.log('MongoDB disconnected - attempting to reconnect...');
        // Auto-reconnect on disconnect with exponential backoff
        MongoService.attemptReconnect();
      });

      mongoose.connection.on('reconnected', () => {
        console.log('MongoDB reconnected');
      });
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB
   */
  static async disconnect(): Promise<void> {
    if (mongoose.connection.readyState === 0) {
      console.log('MongoDB already disconnected');
      return;
    }

    try {
      await mongoose.disconnect();
      console.log('MongoDB disconnected via MongoService');
    } catch (error) {
      console.error('Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  /**
   * Get a model by name
   */
  static getModel<T = any>(name: string): Model<T> {
    if (!mongoose.models[name]) {
      throw new Error(`Model '${name}' not found. Make sure it has been registered.`);
    }
    return mongoose.models[name] as Model<T>;
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private static async attemptReconnect(): Promise<void> {
    if (MongoService.isReconnecting || mongoose.connection.readyState === 1) {
      return;
    }

    if (MongoService.reconnectAttempts >= RECONNECT_CONFIG.maxRetries) {
      console.error(`❌ Max reconnection attempts (${RECONNECT_CONFIG.maxRetries}) reached. Giving up.`);
      return;
    }

    MongoService.isReconnecting = true;
    MongoService.reconnectAttempts++;

    // Calculate delay with exponential backoff
    const delay = Math.min(
      RECONNECT_CONFIG.baseDelay * Math.pow(RECONNECT_CONFIG.backoffMultiplier, MongoService.reconnectAttempts - 1),
      RECONNECT_CONFIG.maxDelay
    );

    console.log(`🔄 Attempting to reconnect (${MongoService.reconnectAttempts}/${RECONNECT_CONFIG.maxRetries}) in ${delay}ms...`);

    setTimeout(async () => {
      try {
        if (mongoose.connection.readyState === 0) {
          await MongoService.connect();
          // Reset counters on successful reconnection
          MongoService.reconnectAttempts = 0;
          console.log('✅ Reconnection successful!');
        }
      } catch (reconnectError) {
        console.error(`❌ Reconnection attempt ${MongoService.reconnectAttempts} failed:`, reconnectError);
        // Try again if we haven't reached max retries
        if (MongoService.reconnectAttempts < RECONNECT_CONFIG.maxRetries) {
          MongoService.attemptReconnect();
        }
      } finally {
        MongoService.isReconnecting = false;
      }
    }, delay);
  }

  /**
   * Reset reconnection counters (useful for testing or manual reconnection)
   */
  static resetReconnectCounters(): void {
    MongoService.reconnectAttempts = 0;
    MongoService.isReconnecting = false;
  }
}
