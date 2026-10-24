export const suggestionStatuses = ['received', 'under_review', 'in_development', 'implemented', 'declined'] as const;
export type SuggestionStatus = typeof suggestionStatuses[number];

export interface SuggestionUpdate {
  status: SuggestionStatus;
  reply: string;
  createdAt: Date;
}

export interface Suggestion {
  id: string;
  restaurantId: string;
  restaurantName: string;
  authorEmail: string;
  title: string;
  description: string;
  status: SuggestionStatus;
  revision: number;
  updates: SuggestionUpdate[];
  createdAt: Date;
  updatedAt: Date;
  unread?: boolean;
}

export interface SuggestionFilter {
  page: number;
  pageSize: number;
  status?: SuggestionStatus;
  restaurantId?: string;
  operatorId?: string;
}

export interface ISuggestionRepository {
  create(input: Pick<Suggestion, 'restaurantId' | 'restaurantName' | 'authorEmail' | 'title' | 'description'>): Promise<Suggestion>;
  list(filter: SuggestionFilter): Promise<{ items: Suggestion[]; total: number }>;
  findById(id: string, restaurantId?: string): Promise<Suggestion | null>;
  update(id: string, revision: number, update: SuggestionUpdate): Promise<Suggestion | null>;
  markRead(id: string, operatorId: string, revision: number): Promise<void>;
  unreadCount(restaurantId: string, operatorId: string): Promise<number>;
}
