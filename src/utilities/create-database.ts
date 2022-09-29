import { Level } from 'level'

import { Progress, RestApiResponse } from '../types'

export type Database = {
  deleteIncompleteAsync: () => Promise<void>
  getStatusAsync: (type: string, id: string) => Promise<null | RestApiResponse>
  setStatusToQueuedAsync: (type: string, id: string) => Promise<void>
  setStatusToInProgressAsync: (
    type: string,
    id: string,
    progress: Progress
  ) => Promise<void>
  setStatusToDoneAsync: (type: string, id: string) => Promise<void>
}

const levelDbOptions = { valueEncoding: 'json' }

export function createDatabase(directoryPath: string): Database {
  const db = new Level(directoryPath)

  async function deleteIncompleteAsync(): Promise<void> {
    const deleteOperations: Array<{ type: 'del'; key: string }> = []
    for await (const [key, result] of db.iterator<string, RestApiResponse>(
      levelDbOptions
    )) {
      if (result.status !== 'COMPLETE') {
        deleteOperations.push({ key, type: 'del' })
      }
    }
    db.batch(deleteOperations)
  }

  async function getStatusAsync(
    type: string,
    id: string
  ): Promise<null | RestApiResponse> {
    try {
      const key = createKey(type, id)
      const result: null | RestApiResponse = await db.get(key, levelDbOptions)
      return result
    } catch (error: any) {
      return null
    }
  }

  async function setStatusToQueuedAsync(
    type: string,
    id: string
  ): Promise<void> {
    const key = createKey(type, id)
    return db.put(
      key,
      {
        images: [],
        resultUrl: `${type}/${id}`,
        status: 'QUEUED'
      },
      levelDbOptions
    )
  }

  async function setStatusToInProgressAsync(
    type: string,
    id: string,
    { currentSample, progress, totalSamples }: Progress
  ): Promise<void> {
    const key = createKey(type, id)
    const result: null | RestApiResponse = await db.get(key, levelDbOptions)
    if (result === null) {
      throw new Error('`status` is `null`')
    }
    result.status = 'IN_PROGRESS'
    if (result.images.length === 0) {
      let i = 0
      while (i < totalSamples) {
        result.images.push({
          progress: 0,
          url: `${type}/${id}/${i + 1}.png`
        })
        i += 1
      }
    }
    result.images[currentSample - 1].progress = progress
    return db.put(key, result, levelDbOptions)
  }

  async function setStatusToDoneAsync(type: string, id: string): Promise<void> {
    const key = createKey(type, id)
    const result: null | RestApiResponse = await db.get(key, levelDbOptions)
    if (result === null) {
      throw new Error('`status` is `null`')
    }
    result.status = 'COMPLETE'
    return db.put(key, result, levelDbOptions)
  }

  return {
    deleteIncompleteAsync,
    getStatusAsync,
    setStatusToDoneAsync,
    setStatusToInProgressAsync,
    setStatusToQueuedAsync
  }
}

function createKey(type: string, id: string) {
  return `${type}/${id}`
}