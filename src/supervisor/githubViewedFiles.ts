import { z } from "zod";
import { msg } from "@/shared/messages";

type RunGh = (args: string[]) => Promise<string>;

const query = `query($owner: String!, $name: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      files(first: 100, after: $endCursor) {
        nodes { path viewerViewedState }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

const pageSchema = z.object({
  id: z.string().min(1),
  files: z.array(
    z.object({
      path: z.string(),
      viewerViewedState: z.enum(["VIEWED", "UNVIEWED", "DISMISSED"]),
    }),
  ),
});

async function read(run: RunGh, number: number) {
  const output = await run([
    "api",
    "graphql",
    "--paginate",
    "-F",
    "owner={owner}",
    "-F",
    "name={repo}",
    "-F",
    `number=${number}`,
    "-f",
    `query=${query}`,
    "--jq",
    ".data.repository.pullRequest | {id, files: .files.nodes}",
  ]);
  const pages = output
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => pageSchema.parse(JSON.parse(line)));
  if (!pages[0]) throw new Error(msg("forge.responseInvalid"));
  return {
    id: pages[0].id,
    marks: Object.fromEntries(
      pages.flatMap((page) => page.files.map((file) => [file.path, file.viewerViewedState])),
    ),
  };
}

export async function getGitHubViewedFiles(run: RunGh, number: number) {
  return (await read(run, number)).marks;
}

export async function setGitHubFileViewed(
  run: RunGh,
  number: number,
  path: string,
  viewed: boolean,
) {
  const current = await read(run, number);
  if (!Object.hasOwn(current.marks, path)) throw new Error(msg("forge.responseInvalid"));
  const operation = viewed ? "markFileAsViewed" : "unmarkFileAsViewed";
  await run([
    "api",
    "graphql",
    "-f",
    `query=mutation($id: ID!, $path: String!) { ${operation}(input: {pullRequestId: $id, path: $path}) { clientMutationId } }`,
    "-f",
    `id=${current.id}`,
    "-f",
    `path=${path}`,
  ]);
  return (await read(run, number)).marks;
}
