import { z } from "zod";

export const postStatusEnum = z.enum([
  "new",
  "in_progress",
  "draft_ready",
  "complete",
]);

export const addPostSchema = z.object({
  url: z.string().trim().url("Please enter a valid URL"),
  content: z.string().trim().optional(),
  personaId: z.string().uuid().optional().nullable(),
});

export const updatePostSchema = z.object({
  personaId: z.string().uuid().optional().nullable(),
  postContent: z.string().trim().optional(),
});

export type PostStatus = z.infer<typeof postStatusEnum>;
export type AddPostInput = z.infer<typeof addPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
