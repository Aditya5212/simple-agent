import type {
  Chat as PrismaChat,
  Document as PrismaDocument,
  DocumentKind as PrismaDocumentKind,
  Message as PrismaMessage,
  Suggestion as PrismaSuggestion,
  Stream as PrismaStream,
  User as PrismaUser,
  Visibility as PrismaVisibility,
  Vote as PrismaVote,
} from "@prisma/client";

export type User = PrismaUser;
export type Chat = PrismaChat;
export type DBMessage = PrismaMessage;
export type Vote = PrismaVote;
export type Document = PrismaDocument;
export type Suggestion = PrismaSuggestion;
export type Stream = PrismaStream;
export type Visibility = PrismaVisibility;
export type DocumentKind = PrismaDocumentKind;
