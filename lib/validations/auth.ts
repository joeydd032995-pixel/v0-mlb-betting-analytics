import { z } from "zod"

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  rememberMe: z.boolean().optional(),
})

export const registerStep1Schema = z
  .object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(50, "Name must be at most 50 characters"),
    email: z.string().email("Enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain at least one uppercase letter")
      .regex(/[0-9]/, "Must contain at least one number"),
    confirmPassword: z.string(),
    tos: z
      .boolean()
      .refine((val) => val === true, "You must accept the terms of service"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

export const registerStep2Schema = z.object({
  hearAboutUs: z
    .enum(["google", "twitter", "friend", "github", "other", ""])
    .optional(),
  role: z
    .enum(["developer", "designer", "product", "other", ""])
    .optional(),
})

export type LoginFormValues = z.infer<typeof loginSchema>
export type RegisterStep1Values = z.infer<typeof registerStep1Schema>
export type RegisterStep2Values = z.infer<typeof registerStep2Schema>
