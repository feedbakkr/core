// The root entry is the pure, framework-free path a server or Worker needs:
// the schema format, its checks and the payload validator. Text conversion and
// exports live on their own subpaths (`/text`, `/export`).
export * from "./schema/index.js";
