import {
  Book,
  Short,
  Villain,
  books,
  shorts,
  villains,
  villainIdsByBook,
  villainIdsByShort,
  bookIdsByVillain,
  shortIdsByVillain,
} from "../catalog";
import config from "../config";

const URL = config.url;

const villainNames = new Map(villains.map((v) => [v.id, v.name]));
const bookTitles = new Map(books.map((b) => [b.id, b.Title]));
const shortTitles = new Map(shorts.map((s) => [s.id, s.title]));

const villainLinks = (ids: number[] = []) =>
  ids.map((id) => ({
    name: villainNames.get(id),
    url: `${URL}/api/villain/${id}`,
  }));

export const bookResponse = (book: Book) => ({
  ...book,
  villains: villainLinks(villainIdsByBook.get(book.id)),
});

export const shortResponse = (short: Short) => ({
  ...short,
  villains: villainLinks(villainIdsByShort.get(short.id)),
});

// appears_in only exists to build the links, so it isn't returned
export const villainResponse = ({ appears_in, ...villain }: Villain) => ({
  ...villain,
  books: (bookIdsByVillain.get(villain.id) || []).map((id) => ({
    title: bookTitles.get(id),
    url: `${URL}/api/book/${id}`,
  })),
  shorts: (shortIdsByVillain.get(villain.id) || []).map((id) => ({
    title: shortTitles.get(id),
    url: `${URL}/api/short/${id}`,
  })),
});
