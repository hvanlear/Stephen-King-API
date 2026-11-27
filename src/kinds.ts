import { books, shorts, characters, villains, places, types, collections, publications } from "./catalog";
import {
  bookResponse,
  shortResponse,
  characterResponse,
  placeResponse,
  typeResponse,
  collectionResponse,
  publicationResponse,
} from "./responses";

// Each kind of record the API serves. An entry here gives a kind its
// /api/<list> and /api/<one>/:id routes, its count for the home page and its
// run through the API tests. Its type and loading (catalog.ts), its links
// (responses.ts), its checks (validate-data.ts) and its place on the home
// and docs pages are still written per kind.
export interface Kind {
  // The route names, as in /api/book/:id and /api/books
  one: string;
  list: string;
  records: readonly { id: number }[];
  // A method rather than a function property, so each kind's builder can
  // take its own record type. kind() checks that it matches the records.
  response(record: { id: number }): { id: number };
  // The error for an id that isn't a whole number, and for one with no record
  invalidId: string;
  notFound: string;
}

function kind<T extends { id: number }>(entry: {
  one: string;
  list: string;
  records: T[];
  response: (record: T) => { id: number };
  invalidId: string;
  notFound: string;
}): Kind {
  return entry;
}

export const kinds: Kind[] = [
  kind({
    one: "book",
    list: "books",
    records: books,
    response: bookResponse,
    invalidId: "Book id must be a whole number",
    notFound: "Book not found",
  }),
  kind({
    one: "short",
    list: "shorts",
    records: shorts,
    response: shortResponse,
    invalidId: "Short id must be a whole number",
    notFound: "Short not found",
  }),
  kind({
    one: "character",
    list: "characters",
    records: characters,
    response: characterResponse,
    invalidId: "Character id must be a whole number",
    notFound: "Character not found",
  }),
  // The characters flagged as villains, served as they were before
  // characters existed. Anyone else's id is not found here.
  kind({
    one: "villain",
    list: "villains",
    records: villains,
    response: characterResponse,
    invalidId: "Villain id must be a whole number",
    notFound: "Villain not found",
  }),
  kind({
    one: "place",
    list: "places",
    records: places,
    response: placeResponse,
    invalidId: "Place id must be a whole number",
    notFound: "Place not found",
  }),
  kind({
    one: "type",
    list: "types",
    records: types,
    response: typeResponse,
    invalidId: "Type id must be a whole number",
    notFound: "Type not found",
  }),
  kind({
    one: "collection",
    list: "collections",
    records: collections,
    response: collectionResponse,
    invalidId: "Collection id must be a whole number",
    notFound: "Collection not found",
  }),
  kind({
    one: "publication",
    list: "publications",
    records: publications,
    response: publicationResponse,
    invalidId: "Publication id must be a whole number",
    notFound: "Publication not found",
  }),
];

// How many records each list route returns, keyed by the route: counts.books.
// The home page shows these.
export const counts: Record<string, number> = Object.fromEntries(kinds.map((kind) => [kind.list, kind.records.length]));
