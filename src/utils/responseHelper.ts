import {
  Book,
  Short,
  Villain,
  Place,
  books,
  shorts,
  villains,
  places,
  villainIdsByBook,
  villainIdsByShort,
  bookIdsByVillain,
  shortIdsByVillain,
  placeIdsByParent,
  bookIdsByPlace,
  shortIdsByPlace,
} from "../catalog";
import config from "../config";

const URL = config.url;

const villainNames = new Map(villains.map((v) => [v.id, v.name]));
const bookTitles = new Map(books.map((b) => [b.id, b.Title]));
const shortTitles = new Map(shorts.map((s) => [s.id, s.title]));
const placeNames = new Map(places.map((p) => [p.id, p.name]));

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

const bookLinks = (ids: number[] = []) =>
  ids.map((id) => ({
    title: bookTitles.get(id),
    url: `${URL}/api/book/${id}`,
  }));

const shortLinks = (ids: number[] = []) =>
  ids.map((id) => ({
    title: shortTitles.get(id),
    url: `${URL}/api/short/${id}`,
  }));

// appears_in only exists to build the links, so it isn't returned
export const villainResponse = ({ appears_in, ...villain }: Villain) => ({
  ...villain,
  books: bookLinks(bookIdsByVillain.get(villain.id)),
  shorts: shortLinks(shortIdsByVillain.get(villain.id)),
});

const placeLink = (id: number) => ({
  name: placeNames.get(id),
  url: `${URL}/api/place/${id}`,
});

// parentId and appears_in only exist to build the links, so they aren't returned
export const placeResponse = ({ parentId, appears_in, ...place }: Place) => ({
  ...place,
  parent: parentId === null ? null : placeLink(parentId),
  places: (placeIdsByParent.get(place.id) || []).map(placeLink),
  books: bookLinks(bookIdsByPlace.get(place.id)),
  shorts: shortLinks(shortIdsByPlace.get(place.id)),
});
