import { Request, Response } from "express";
import { shorts } from "../catalog";
import { shortResponse } from "../utils/responseHelper";
import { sendList } from "../utils/pagination";
import { parseId } from "../utils/parseId";

// The catalog never changes while the server runs, so build responses once
const responses = shorts.map(shortResponse);
const responsesById = new Map(responses.map((short) => [short.id, short]));

//get one short
export const getOneShort = (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Short id must be a whole number" });
  }
  const short = responsesById.get(id);
  if (!short) {
    return res.status(404).json({ error: "Short not found" });
  }
  res.json({ data: short });
};

//get all shorts
export const getShorts = (req: Request, res: Response) => {
  sendList(res, responses, req.query);
};
