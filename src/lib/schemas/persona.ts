import { z } from "zod";

const platformEnum = z.enum([
  "twitter",
  "linkedin",
  "blog",
  "reddit",
  "email",
  "other",
]);

export const createPersonaSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(255, "Name must be 255 characters or less"),
  description: z
    .string()
    .max(2000, "Description must be 2000 characters or less")
    .optional()
    .transform((v) => v || undefined),
  platform: platformEnum.optional().transform((v) => v || undefined),
});

export const editPersonaSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(255, "Name must be 255 characters or less")
      .optional(),
    description: z
      .string()
      .max(2000, "Description must be 2000 characters or less")
      .optional()
      .transform((v) => v || undefined),
    platform: platformEnum
      .optional()
      .nullable()
      .transform((v) => v || undefined),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

export type CreatePersonaInput = z.infer<typeof createPersonaSchema>;
export type EditPersonaInput = z.infer<typeof editPersonaSchema>;
export type Platform = z.infer<typeof platformEnum>;
