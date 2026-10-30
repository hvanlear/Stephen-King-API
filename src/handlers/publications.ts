import { Request, Response } from "express";
import { publications } from "../catalog";
import { publicationResponse } from "../utils/responseHelper";
import { sendList } from "../utils/pagination";
import { parseId } from "../utils/parseId";

// The catalog never changes while the server runs, so build responses once
const responses = publications.map(publicationResponse);
const responsesById = new Map(responses.map((publication) => [publication.id, publication]));

export const getOnePublication = (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Publication id must be a whole number" });
  }
  const publication = responsesById.get(id);
  if (!publication) {
    return res.status(404).json({ error: "Publication not found" });
  }
  res.json({ data: publication });
};

export const getPublications = (req: Request, res: Response) => {
  sendList(res, responses, req.query);
};
