/** specs/0183-conteudo-pagina-inicial — conteúdo da página inicial pública, editado pelo administrador da plataforma. */
export interface LandingFeature {
  id: string;
  text: string;
}

export type LandingMediaType = 'youtube' | 'image';

export interface LandingHowItWorksItem {
  id: string;
  title: string;
  description: string;
  mediaType: LandingMediaType;
  mediaUrl: string;
}

export interface LandingClient {
  id: string;
  companyName: string;
  description: string;
  imageUrl: string;
}

export interface LandingCompany {
  legalName: string;
  cnpj: string;
  address: string;
  phone: string;
  email: string;
  instagramUrl: string;
  termsUrl: string;
  privacyUrl: string;
}

/** A ordem dos arrays é a ordem de exibição. */
export interface LandingContent {
  features: LandingFeature[];
  howItWorks: LandingHowItWorksItem[];
  clients: LandingClient[];
  company: LandingCompany;
}

export const EMPTY_LANDING_COMPANY: Readonly<LandingCompany> = {
  legalName: '',
  cnpj: '',
  address: '',
  phone: '',
  email: '',
  instagramUrl: '',
  termsUrl: '',
  privacyUrl: '',
};

export function emptyLandingContent(): LandingContent {
  return { features: [], howItWorks: [], clients: [], company: { ...EMPTY_LANDING_COMPANY } };
}

export const testimonialStatuses = ['pending', 'approved', 'rejected'] as const;
export type TestimonialStatus = (typeof testimonialStatuses)[number];

export interface LandingTestimonial {
  id: string;
  authorName: string;
  businessName: string;
  city: string;
  text: string;
  rating?: number;
  status: TestimonialStatus;
  createdAt: Date;
}

export type NewLandingTestimonial = Omit<LandingTestimonial, 'id' | 'status' | 'createdAt'>;

export interface ILandingContentRepository {
  get(): Promise<LandingContent>;
  update(content: LandingContent): Promise<LandingContent>;
}

export interface ILandingTestimonialRepository {
  create(input: NewLandingTestimonial): Promise<LandingTestimonial>;
  list(status?: TestimonialStatus): Promise<LandingTestimonial[]>;
  updateStatus(id: string, status: TestimonialStatus): Promise<LandingTestimonial | null>;
  delete(id: string): Promise<boolean>;
}

const YOUTUBE_ID = /^[\w-]{11}$/;

/** Extrai o id do vídeo de links `watch?v=`, `youtu.be/`, `embed/` e `shorts/`; `null` se não for YouTube. */
export function extractYoutubeId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^(www|m)\./, '');
  let candidate: string | null = null;
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, kind, id] = url.pathname.split('/');
    candidate = url.pathname === '/watch' ? url.searchParams.get('v') : kind === 'embed' || kind === 'shorts' ? id ?? null : null;
  }
  return candidate && YOUTUBE_ID.test(candidate) ? candidate : null;
}
