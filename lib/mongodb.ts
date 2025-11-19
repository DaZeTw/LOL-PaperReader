import { MongoClient, Db, ObjectId } from "mongodb"

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined
  // eslint-disable-next-line no-var
  var _mongoDb: Db | undefined
}

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DATABASE || "paperreader"

if (!uri) {
  throw new Error("MONGODB_URI environment variable is not set")
}

let client: MongoClient
let clientPromise: Promise<MongoClient>

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri)
    global._mongoClientPromise = client.connect()
  }
  clientPromise = global._mongoClientPromise
} else {
  client = new MongoClient(uri)
  clientPromise = client.connect()
}

export async function getMongoClient(): Promise<MongoClient> {
  return clientPromise
}

export async function getMongoDb(): Promise<Db> {
  if (process.env.NODE_ENV === "development") {
    if (!global._mongoDb) {
      const connectedClient = await getMongoClient()
      global._mongoDb = connectedClient.db(dbName)
    }
    return global._mongoDb
  }

  const connectedClient = await getMongoClient()
  return connectedClient.db(dbName)
}

export async function closeMongoConnection(): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    const connectedClient = await clientPromise
    await connectedClient.close()
    global._mongoClientPromise = undefined
    global._mongoDb = undefined
    return
  }

  const connectedClient = await getMongoClient()
  await connectedClient.close()
}

export interface Workspace {
  _id?: ObjectId
  user_id: string
  name: string
  document_ids: ObjectId[]
  created_at: Date
}

export interface Document {
  _id?: ObjectId
  user_id: string
  workspace_id?: ObjectId
  title: string
  original_filename: string
  stored_path: string
  num_pages: number
  status: string
  source: string
  preview_image?: string
  created_at: Date
  updated_at: Date
  file_size: number
  file_type: string
}

export async function createWorkspace(userId: string, name = "Default Workspace"): Promise<Workspace> {
  const db = await getMongoDb()
  const workspace: Workspace = {
    user_id: userId,
    name,
    document_ids: [],
    created_at: new Date(),
  }

  const result = await db.collection<Workspace>("workspaces").insertOne(workspace)
  workspace._id = result.insertedId
  return workspace
}

export async function getWorkspaceByUserId(userId: string): Promise<Workspace | null> {
  const db = await getMongoDb()
  return db.collection<Workspace>("workspaces").findOne({ user_id: userId })
}

export async function getOrCreateWorkspace(userId: string): Promise<Workspace> {
  const existing = await getWorkspaceByUserId(userId)
  if (existing) {
    return existing
  }
  return createWorkspace(userId)
}

export async function addDocumentToWorkspace(workspaceId: ObjectId, documentId: ObjectId): Promise<void> {
  const db = await getMongoDb()
  await db
    .collection<Workspace>("workspaces")
    .updateOne({ _id: workspaceId }, { $addToSet: { document_ids: documentId } })
}

export type CreateDocumentInput = Omit<Document, "_id" | "created_at" | "updated_at">

export async function createDocument(doc: CreateDocumentInput): Promise<Document> {
  const db = await getMongoDb()
  const document: Document = {
    ...doc,
    created_at: new Date(),
    updated_at: new Date(),
  }

  const result = await db.collection<Document>("documents").insertOne(document)
  document._id = result.insertedId
  return document
}

export async function getDocumentById(documentId: ObjectId): Promise<Document | null> {
  const db = await getMongoDb()
  return db.collection<Document>("documents").findOne({ _id: documentId })
}

export async function getDocumentsByUserId(userId: string): Promise<Document[]> {
  const db = await getMongoDb()
  return db.collection<Document>("documents").find({ user_id: userId }).sort({ created_at: -1 }).toArray()
}

export async function getDocumentsByWorkspaceId(workspaceId: ObjectId): Promise<Document[]> {
  const db = await getMongoDb()
  return db.collection<Document>("documents").find({ workspace_id: workspaceId }).sort({ created_at: -1 }).toArray()
}

export async function getDocumentsByIds(userId: string, documentIds: ObjectId[]): Promise<Document[]> {
  const db = await getMongoDb()
  return db
    .collection<Document>("documents")
    .find({ user_id: userId, _id: { $in: documentIds } })
    .sort({ created_at: -1 })
    .toArray()
}

export async function updateDocumentStatus(documentId: ObjectId, status: string): Promise<void> {
  const db = await getMongoDb()
  await db.collection<Document>("documents").updateOne(
    { _id: documentId },
    {
      $set: {
        status,
        updated_at: new Date(),
      },
    },
  )
}

export async function updateDocument(documentId: ObjectId, updates: Partial<Document>): Promise<void> {
  const db = await getMongoDb()
  await db.collection<Document>("documents").updateOne(
    { _id: documentId },
    {
      $set: {
        ...updates,
        updated_at: new Date(),
      },
    },
  )
}

export async function removeDocumentFromWorkspace(workspaceId: ObjectId, documentId: ObjectId): Promise<void> {
  const db = await getMongoDb()
  await db
    .collection<Workspace>("workspaces")
    .updateOne({ _id: workspaceId }, { $pull: { document_ids: documentId } })
}

export async function removeDocumentsFromWorkspace(workspaceId: ObjectId, documentIds: ObjectId[]): Promise<void> {
  if (documentIds.length === 0) return
  const db = await getMongoDb()
  await db.collection<Workspace>("workspaces").updateOne(
    { _id: workspaceId },
    {
      $pull: {
        document_ids: { $in: documentIds },
      },
    },
  )
}

export async function clearWorkspaceDocuments(workspaceId: ObjectId): Promise<void> {
  const db = await getMongoDb()
  await db.collection<Workspace>("workspaces").updateOne(
    { _id: workspaceId },
    {
      $set: {
        document_ids: [],
      },
    },
  )
}

export async function deleteDocumentsByIds(userId: string, documentIds: ObjectId[]): Promise<number> {
  if (documentIds.length === 0) return 0
  const db = await getMongoDb()
  const result = await db.collection<Document>("documents").deleteMany({
    user_id: userId,
    _id: { $in: documentIds },
  })
  return result.deletedCount ?? 0
}

export async function deleteAllDocumentsForUser(userId: string): Promise<number> {
  const db = await getMongoDb()
  const result = await db.collection<Document>("documents").deleteMany({ user_id: userId })
  return result.deletedCount ?? 0
}

