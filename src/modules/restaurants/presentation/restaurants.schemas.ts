import { z } from 'zod';

// specs/0010-configuracao-restaurante REQ-1, REQ-8, REQ-9, REQ-10 — cada página da retaguarda
// manda só os campos que edita (PUT /restaurants/me genérico, `plan.md`).
export const restaurantProfileSchema = z
  .object({
    name: z.string().min(1),
    logoUrl: z.string().url(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar em formato #RRGGBB'),
    address: z.object({
      street: z.string().min(1),
      number: z.string().min(1),
      complement: z.string().optional(),
      neighborhood: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(1),
      zipCode: z.string().min(1),
    }),
    phone: z.string().min(1),
    minimumOrderValue: z.number().nonnegative(),
    welcomeMessage: z.string(),
    orderConfirmationGreeting: z.string(),
    pixKey: z.string(),
    pixKeyType: z.enum(['telefone', 'cpf', 'cnpj', 'email', 'aleatoria']),
    pixBeneficiaryName: z.string(),
  })
  .partial();

const businessHourSchema = z
  .object({
    dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
    isClosed: z.boolean(),
    openTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    closeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  })
  .refine(
    (day) => day.isClosed || !day.openTime || !day.closeTime || day.closeTime > day.openTime,
    // REQ-7: horário de fechamento não pode ser anterior ao de abertura no mesmo dia. Validação
    // "de verdade" também no BFF (não só no React Hook Form do lado web) — nunca confiar só no
    // cliente pra uma regra de negócio.
    { message: 'Horário de fechamento não pode ser anterior ao de abertura' },
  );

export const businessHoursSchema = z.array(businessHourSchema);

export const setActiveSchema = z.object({ isActive: z.boolean() });

export const updateSlugSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter só letras minúsculas, números e hífen'),
});

// specs/0021-papeis-operador REQ-1 — todo operador novo já nasce com um papel explícito (o
// `dono` que cadastra escolhe; `gerente` por padrão no formulário da web, mas o BFF sempre exige
// o campo, nunca assume).
export const operatorRoleSchema = z.enum(['dono', 'gerente', 'financeiro']);

export const addOperatorSchema = z.object({ email: z.string().email(), role: operatorRoleSchema });

// specs/0021-papeis-operador REQ-8 — troca do papel de um operador já cadastrado.
export const updateOperatorRoleSchema = z.object({ role: operatorRoleSchema });
