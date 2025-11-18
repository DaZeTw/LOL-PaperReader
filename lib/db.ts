import { Pool, QueryResult } from 'pg'

// Database connection pool
let pool: Pool | null = null

/**
 * Get or create database connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL

    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set')
    }

    pool = new Pool({
      connectionString,
      // Connection pool settings
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
    })

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err)
    })
  }

  return pool
}

/**
 * Execute a query
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = getPool()
  return pool.query<T>(text, params)
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient() {
  const pool = getPool()
  return pool.connect()
}

/**
 * Close the database connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

/**
 * User interface matching the database schema
 */
export interface User {
  id: number
  email: string
  google_id: string | null
  name: string | null
  role: string
  is_active: boolean
  last_login: Date | null
  created_at: Date
  updated_at: Date
}

/**
 * Create or update user in database
 * Returns the user object
 */
export async function upsertUser(data: {
  email: string
  google_id?: string
  name?: string | null
}): Promise<User> {
  const { email, google_id, name } = data

  // First, try to find existing user by email or google_id
  let result = await query<User>(
    `SELECT * FROM users 
     WHERE email = $1 OR (google_id IS NOT NULL AND google_id = $2)
     LIMIT 1`,
    [email, google_id || null]
  )

  let user: User

  if (result.rows.length > 0) {
    // User exists, update it
    user = result.rows[0]
    
    // Update user information and last_login
    result = await query<User>(
      `UPDATE users 
       SET name = COALESCE($1, name),
           google_id = COALESCE($2, google_id),
           last_login = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [name || user.name, google_id || user.google_id, user.id]
    )
    
    user = result.rows[0]
  } else {
    // User doesn't exist, create new one
    result = await query<User>(
      `INSERT INTO users (email, google_id, name, last_login)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       RETURNING *`,
      [email, google_id || null, name || null]
    )
    
    user = result.rows[0]
  }

  return user
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await query<User>(
    'SELECT * FROM users WHERE email = $1 LIMIT 1',
    [email]
  )
  
  return result.rows[0] || null
}

/**
 * Get user by ID
 */
export async function getUserById(id: number): Promise<User | null> {
  const result = await query<User>(
    'SELECT * FROM users WHERE id = $1 LIMIT 1',
    [id]
  )
  
  return result.rows[0] || null
}

/**
 * Get user by Google ID
 */
export async function getUserByGoogleId(google_id: string): Promise<User | null> {
  const result = await query<User>(
    'SELECT * FROM users WHERE google_id = $1 LIMIT 1',
    [google_id]
  )
  
  return result.rows[0] || null
}

