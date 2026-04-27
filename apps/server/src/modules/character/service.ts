/**
 * Character service — protocol-agnostic CRUD over the character catalog.
 *
 * Characters are authored in the admin dashboard (name, avatar, portrait,
 * default side). The catalog is referenced by other modules via the
 * character uuid — current consumer is `dialogue`, which stores
 * `speaker.characterId` inside each node's jsonb and flattens the
 * character on read so the client payload stays a simple
 * `{ name, avatarUrl, side }`.
 *
 * This file MUST NOT import Hono, @hono/zod-openapi, or `../../db`. It
 * receives `db` through `Pick<AppDeps, "db">`. See apps/server/CLAUDE.md.
 */

import { and, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import { characterDefinitions } from "../../schema/character";
import {
  CharacterAliasConflict,
  CharacterNotFound,
} from "./errors";
import type {
  CharacterDefinition,
  CharacterSpeakerView,
} from "./types";
import type {
  CreateCharacterInput,
  UpdateCharacterInput,
} from "./validators";

type CharacterDeps = Pick<AppDeps, "db">;

export function createCharacterService(d: CharacterDeps) {
  const { db } = d;

  async function loadById(
    organizationId: string,
    id: string,
  ): Promise<CharacterDefinition> {
    const rows = await db
      .select()
      .from(characterDefinitions)
      .where(
        and(
          eq(characterDefinitions.id, id),
          eq(characterDefinitions.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new CharacterNotFound(id);
    return rows[0];
  }

  return {
    async createCharacter(
      organizationId: string,
      input: CreateCharacterInput,
    ): Promise<CharacterDefinition> {
      try {
        const [row] = await db
          .insert(characterDefinitions)
          .values({
            organizationId,
            alias: input.alias ?? null,
            name: input.name,
            description: input.description ?? null,
            avatarUrl: input.avatarUrl ?? null,
            portraitUrl: input.portraitUrl ?? null,
            defaultSide: input.defaultSide ?? null,
            isActive: input.isActive ?? true,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("character insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && input.alias) {
          throw new CharacterAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async updateCharacter(
      organizationId: string,
      id: string,
      input: UpdateCharacterInput,
    ): Promise<CharacterDefinition> {
      // Ensure the row exists + belongs to this org before we touch it.
      await loadById(organizationId, id);

      const patch: Record<string, unknown> = {};
      if (input.alias !== undefined) patch.alias = input.alias;
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;
      if (input.portraitUrl !== undefined) patch.portraitUrl = input.portraitUrl;
      if (input.defaultSide !== undefined) patch.defaultSide = input.defaultSide;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      if (input.metadata !== undefined) patch.metadata = input.metadata;

      if (Object.keys(patch).length === 0) {
        return loadById(organizationId, id);
      }

      try {
        const [row] = await db
          .update(characterDefinitions)
          .set(patch)
          .where(
            and(
              eq(characterDefinitions.id, id),
              eq(characterDefinitions.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new CharacterNotFound(id);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && typeof input.alias === "string") {
          throw new CharacterAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async deleteCharacter(
      organizationId: string,
      id: string,
    ): Promise<void> {
      const deleted = await db
        .delete(characterDefinitions)
        .where(
          and(
            eq(characterDefinitions.id, id),
            eq(characterDefinitions.organizationId, organizationId),
          ),
        )
        .returning({ id: characterDefinitions.id });
      if (deleted.length === 0) throw new CharacterNotFound(id);
    },

    async listCharacters(
      organizationId: string,
      params: PageParams = {},
    ): Promise<Page<CharacterDefinition>> {
      const limit = clampLimit(params.limit);
      const conds: SQL[] = [eq(characterDefinitions.organizationId, organizationId)];
      const seek = cursorWhere(
        params.cursor,
        characterDefinitions.createdAt,
        characterDefinitions.id,
      );
      if (seek) conds.push(seek);
      if (params.q) {
        const pat = `%${params.q}%`;
        const search = or(ilike(characterDefinitions.name, pat), ilike(characterDefinitions.alias, pat));
        if (search) conds.push(search);
      }
      const rows = await db
        .select()
        .from(characterDefinitions)
        .where(and(...conds))
        .orderBy(desc(characterDefinitions.createdAt), desc(characterDefinitions.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getCharacter(
      organizationId: string,
      id: string,
    ): Promise<CharacterDefinition> {
      return loadById(organizationId, id);
    },

    /**
     * Batch-fetch characters by id, scoped to an org. Missing ids are
     * simply absent from the returned Map — callers that need
     * "exists-or-throw" semantics should use `assertCharactersExist`
     * in addition.
     *
     * Used by the dialogue service to flatten speaker.characterId
     * references in a single query per /start or /advance.
     */
    async loadCharactersByIds(
      organizationId: string,
      ids: string[],
    ): Promise<Map<string, CharacterSpeakerView>> {
      if (ids.length === 0) return new Map();
      const rows = await db
        .select({
          id: characterDefinitions.id,
          name: characterDefinitions.name,
          avatarUrl: characterDefinitions.avatarUrl,
          portraitUrl: characterDefinitions.portraitUrl,
        })
        .from(characterDefinitions)
        .where(
          and(
            eq(characterDefinitions.organizationId, organizationId),
            inArray(characterDefinitions.id, ids),
          ),
        );
      return new Map(rows.map((r) => [r.id, r]));
    },

    /**
     * Validate that every given characterId exists in this org. Throws
     * `CharacterNotFound` on the first missing id so callers can map it
     * to their own error code (dialogue → DialogueUnknownCharacter).
     */
    async assertCharactersExist(
      organizationId: string,
      ids: string[],
    ): Promise<void> {
      if (ids.length === 0) return;
      const rows = await db
        .select({ id: characterDefinitions.id })
        .from(characterDefinitions)
        .where(
          and(
            eq(characterDefinitions.organizationId, organizationId),
            inArray(characterDefinitions.id, ids),
          ),
        );
      const known = new Set(rows.map((r) => r.id));
      for (const id of ids) {
        if (!known.has(id)) throw new CharacterNotFound(id);
      }
    },
  };
}

export type CharacterService = ReturnType<typeof createCharacterService>;

