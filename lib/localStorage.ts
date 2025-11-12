/**
 * Safe localStorage wrapper with error handling and SSR support
 */
export const safeLocalStorage = {
  /**
   * Get an item from localStorage
   * @param key - The storage key
   * @returns The stored value or null if not found/error
   */
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null
    try {
      return window.localStorage.getItem(key)
    } catch (e) {
      console.warn(`Failed to get "${key}" from localStorage:`, e)
      return null
    }
  },

  /**
   * Set an item in localStorage
   * @param key - The storage key
   * @param value - The value to store
   * @returns true if successful, false otherwise
   */
  setItem: (key: string, value: string): boolean => {
    if (typeof window === 'undefined') return false
    try {
      window.localStorage.setItem(key, value)
      return true
    } catch (e) {
      console.warn(`Failed to set "${key}" in localStorage:`, e)
      return false
    }
  },

  /**
   * Remove an item from localStorage
   * @param key - The storage key
   * @returns true if successful, false otherwise
   */
  removeItem: (key: string): boolean => {
    if (typeof window === 'undefined') return false
    try {
      window.localStorage.removeItem(key)
      return true
    } catch (e) {
      console.warn(`Failed to remove "${key}" from localStorage:`, e)
      return false
    }
  },

  /**
   * Parse a JSON string from localStorage
   * @param key - The storage key
   * @returns Parsed JSON object or null if not found/error
   */
  getJSON: <T = any>(key: string): T | null => {
    const item = safeLocalStorage.getItem(key)
    if (!item || item.trim() === '' || item.trim() === '[]') return null
    try {
      return JSON.parse(item) as T
    } catch (e) {
      console.warn(`Failed to parse JSON from "${key}":`, e)
      safeLocalStorage.removeItem(key) // Clear invalid data
      return null
    }
  },

  /**
   * Stringify and store a JSON object in localStorage
   * @param key - The storage key
   * @param value - The value to stringify and store
   * @returns true if successful, false otherwise
   */
  setJSON: (key: string, value: any): boolean => {
    try {
      const json = JSON.stringify(value)
      return safeLocalStorage.setItem(key, json)
    } catch (e) {
      console.warn(`Failed to stringify/set "${key}" in localStorage:`, e)
      return false
    }
  },
}
