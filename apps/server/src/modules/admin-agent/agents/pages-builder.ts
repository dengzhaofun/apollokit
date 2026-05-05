/**
 * `pages-builder` agent — drives the apollokit-pages dashboard chat.
 *
 * Behavior policy (different from form-fill / global-assistant):
 *   - Tools have real `execute` — proposing a draft, publishing, and
 *     rolling back are write-through. The operator confirms via a
 *     UI gesture (clicking publish in the timeline) instead of an
 *     inline "confirm" card. The agent's job is to propose; it does
 *     not auto-publish (rule 7 in the system prompt).
 *   - The system prompt embeds the full @repo/page-blocks catalog +
 *     AI metadata + the project's current draft, so a single tool
 *     turn round-trip is enough for the model to emit a coherent
 *     full schema.
 *   - `stopWhen: stepCountIs(6)` allows the model to: (1) read
 *     listAvailableBlocks/Templates if it needs richer context,
 *     (2) propose a draft, (3) self-correct on validation error
 *     (max 3 retries built into the loop). Beyond 6 steps the agent
 *     gives up and asks the operator to clarify in plain language.
 */

import { stepCountIs } from "ai";

import { pageService } from "../../page";
import type { PageProjectSchema } from "../../page/types";
import { buildPagesBuilderSystemPrompt } from "../tools/pages/system-prompt";
import { buildPagesBuilderTools } from "../tools/pages";
import type { ChatExecutionContext } from "../types";
import { DEFAULT_MODEL_ID } from "./form-fill";
import type { AgentDefinition, SystemPromptInput } from "./types";

export function createPagesBuilderAgent(
  execCtx: ChatExecutionContext,
): AgentDefinition {
  return {
    name: "pages-builder",
    modelId: DEFAULT_MODEL_ID,
    stopWhen: stepCountIs(6),

    async buildSystem(input: SystemPromptInput) {
      // Pages-builder ignores `surface` (admin module surface system
      // doesn't apply) and `mentions` (no @-mention plumbing for page
      // schemas — the schema itself is the context).
      const projectId = execCtx.pageProjectId;
      if (!projectId) {
        // No project bound to this turn (the route handler should have
        // rejected the request earlier; defensive fallback).
        return [
          "You are the Apollo Pages builder.",
          "No project is currently bound to this conversation. Ask the",
          "operator which page project they want to edit. Available",
          "tool: createPageProject (rare — usually done from the admin",
          "UI).",
        ].join("\n");
      }

      const project = await pageService.getProjectById(
        execCtx.tenantId,
        projectId,
      );

      // Latest draft = newest version row. We rely on listVersions
      // returning DESC order — see service.listVersions.
      const versionsPage = await pageService.listVersions(
        execCtx.tenantId,
        projectId,
        { limit: 1 },
      );
      const latestDraft = versionsPage.items[0] ?? null;

      // Published version number — only present when the project has
      // a publishedVersionId pointer.
      let publishedVersionNumber: number | null = null;
      if (project.publishedVersionId) {
        try {
          const v = await pageService.getVersion(
            execCtx.tenantId,
            projectId,
            project.publishedVersionId,
          );
          publishedVersionNumber = v.versionNumber;
        } catch {
          // Pointer points at a deleted version — surface as "(none)"
          // and let the operator fix via UI.
          publishedVersionNumber = null;
        }
      }

      return buildPagesBuilderSystemPrompt({
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
          authMode: project.authMode,
          boundModules: project.boundModules,
          publishedVersionId: project.publishedVersionId,
        },
        draftSchema:
          (latestDraft?.schema as unknown as PageProjectSchema | null | undefined) ??
          null,
        publishedVersionNumber,
        locale: input.locale,
      });
    },

    buildTools() {
      // Pages-builder doesn't use the per-module mention extension
      // pattern (form-fill / global-assistant pull in patch tools per
      // mentioned module). Its toolset is fixed: 9 page-management
      // tools, exposed unconditionally.
      return buildPagesBuilderTools();
    },
  };
}
