export type StatusValue = "working" | "meeting" | "break" | "offline";

export interface Status {
  id: string;
  userId: string;
  userName: string;
  value: StatusValue;
  note: string | null;
  updatedAt: string;
}

export interface SetStatusInput {
  userId: string;
  userName: string;
  value: StatusValue;
  note?: string;
}
