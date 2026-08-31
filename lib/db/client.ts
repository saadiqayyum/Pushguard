import {
  MongoClient,
  type Collection,
  type CreateIndexesOptions,
  type Db,
  type Document,
  type IndexSpecification,
} from "mongodb"
import { env } from "@/lib/env"

// One client, and collections without an await.
const cache = globalThis as unknown as {
  _mongoClient?: MongoClient
  _mongoIndexes?: Promise<void>
}

export type IndexDef = { keys: IndexSpecification; options?: CreateIndexesOptions }

const registry: (IndexDef & { collection: string })[] = []

function client(): MongoClient {
  cache._mongoClient ??= new MongoClient(env().MONGODB_URI)
  return cache._mongoClient
}

function database(): Db {
  return client().db()
}

// Declare a collection: its name, its document type, and the indexes it needs.
export function defineCollection<T extends Document>(
  name: string,
  indexes: IndexDef[] = [],
): () => Collection<T> {
  registry.push(...indexes.map((index) => ({ collection: name, ...index })))
  return () => {
    void ensureIndexes()
    return database().collection<T>(name)
  }
}

// Build every declared index, once per process.
export function ensureIndexes(): Promise<void> {
  cache._mongoIndexes ??= (async () => {
    const db = database()
    await Promise.all(
      registry.map((spec) =>
        db
          .collection(spec.collection)
          .createIndex(spec.keys, spec.options ?? {})
          .catch((error: unknown) => {
            console.error(
              JSON.stringify({
                level: "error",
                message: "index_create_failed",
                collection: spec.collection,
                error: error instanceof Error ? error.message : String(error),
              }),
            )
          }),
      ),
    )
  })()
  return cache._mongoIndexes
}

// For the writes that rely on a unique index to settle a race.
export function indexesReady(): Promise<void> {
  return ensureIndexes()
}

// For the purges, which delete across several collections at once.
export function rawDb(): Db {
  void ensureIndexes()
  return database()
}
