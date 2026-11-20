import type { RemoteImageRef } from "@/shared/remote/imageRef";

// Embedded offline assets: a 16 x 12 synthetic colour pattern (PNG/JPEG/WebP),
// a 16 x 12 solid GIF, and a 16 x 12 vector illustration. None is a photograph.
// These are complete encoded files, not header-only strings or 1px placeholders.
export const IMAGE_ASSETS = {
  png: {
    mime: "image/png",
    width: 16,
    height: 12,
    base64:
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAACXBIWXMAAAPoAAAD6AG1e1JrAAABa0lEQVQokQXBIRWAMBSG0RcBsQDImf8cAkwQ4UVALABykgATRFgExAIgJwnwCSIQgXvNTJMxmxZjNbmxmXbjMJ1GM13GbXqM1/QZZoEpaA4sQWvAg7bAHnQEzqAWuILuwBP0Br4gs6gpMkctkTXKI1vUHjmizkiLuiJ31BN5o76IWWJKmhNL0prwpC2xJx2JM6klrqQ78SS9iS/JzDU5s2txVpc7m2t3DtfpNNfl3K7HeV2fY5aZsubMkrVmPGvL7FlH5sxqmSvrzjxZb+bLMiuaCnPRUliLvLAV7YWj6Cy0oqtwFz2Ft+grmFWmqrmyVK0Vr9oqe9VROata5aq6K0/VW/mqzJqmxty0NNYmb2xNe+NoOhut6WrcTU/jbfoaZp2pa+4sXWvHu7bO3nV0zq7WubruztP1dr4us6FpMA8tg3XIB9vQPjiGzkEbugb30DN4h76BGUxohgWt4GiDHR1wogYXuuFBL3zoBxCJD/A8lHMNAAAAAElFTkSuQmCC",
  },
  jpeg: {
    mime: "image/jpeg",
    width: 16,
    height: 12,
    base64:
      "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAMABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAABgf/xAAiEAAABAQHAAAAAAAAAAAAAAABBRGhAgQx8AYSIiNBUdL/xAAVAQEBAAAAAAAAAAAAAAAAAAABBP/EABoRAAICAwAAAAAAAAAAAAAAAAADBAYFISL/2gAMAwEAAhEDEQA/AJsU4UTLttfTcJpZlOFETba+m4TS2Ky6WCkFFZfIWAIzKy6WhpBRWzeQsARnZtmyaq2JvJ//2Q==",
  },
  gif: {
    mime: "image/gif",
    width: 16,
    height: 12,
    base64: "R0lGODlhEAAMAIAAAExpcQx40iH5BAUAAAAALAAAAAAQAAwAAAIMjI+py+0Po5y02msKADs=",
  },
  webp: {
    mime: "image/webp",
    width: 16,
    height: 12,
    base64:
      "UklGRoYAAABXRUJQVlA4IHoAAACwAgCdASoQAAwAAUAmJbACdAq7JwD//9AAQk8rv8AA/v2zs6ED+oScC+NXvOPCrJOBfBJqjKc7SdYjFaKxmNeGB4WB6T4FMFklLwuBJUCbKe88WGYVQz/+JFeat3b3ztFri/W55/Xp7//Sw37v//6QeTBgpD+ZeAAAAA==",
  },
} as const;
// Larger synthetic PNG for real pointer and touch interactions in the transcript.
export const TRANSCRIPT_PREVIEW_IMAGE = {
  mime: "image/png",
  width: 320,
  height: 240,
  base64:
    "iVBORw0KGgoAAAANSUhEUgAAAUAAAADwCAMAAABG801ZAAAAD1BMVEUSMUYthn7RuVnI4NOwW0V+sAR1AAACe0lEQVR42u3dMY4bURBDQdnS/c/s1MkCNgioyUH9mFGl0w/zen3v/fre+/219wIIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAiwEfP/1Pj+89w+vad8AuOzXADjtVwC47XcPOO53Drju9zkGnPc7Btz3uwV8gN8p4BP8LgEf4XcI+Ay/O8CH+NUBrvm1Ac75lQHu+XUBDvpVAS76NQFO+hUBbvr1AI761QCu+rUAzvqVAO76dQAO+1UALvs1AE77FQBu+90DjvudA677vY8B5/2OAff9bgEf4HcK+AS/S8BH+B0CPsOv4sR32a8OcO57exng3r1CF+DgvUcV4OK9TBPg5L1REeDmvVYP4Oi9Ww3g6r1gC+DsvWUJ4O69agfg8L2vXjjc64XDvV443OuFw71eONzrhcO9Xjjc64XDvV443OuFw71eONzrhcO9Xjjc64XDvV443OuFw71e+K0XPt3rhfXCt3u9cLjXC4d7vXC41wuHe71wuNcLh3u9cLjXC4d7vXC41wuHe71wuNcLh3u9cLjXC4d7vXC41wuHe71wuNcLh3u9cLjXC4d7vfBHL3y61wvrhW/3euFwrxcO93rhcK8XDvdngP/5/KAZIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAjw398flRTnAN0a6nQAAAAASUVORK5CYII=",
} as const;
export const SVG_ASSET =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12"><rect width="16" height="12" fill="#267ac8"/><circle cx="8" cy="6" r="4" fill="#f4c540"/></svg>';
export function imageDataUrl(format: keyof typeof IMAGE_ASSETS): string {
  const asset = IMAGE_ASSETS[format];
  return `data:${asset.mime};base64,${asset.base64}`;
}

const png = imageDataUrl("png");
export const REMOTE_REF: RemoteImageRef = {
  __poracodeImageRef: {
    threadId: "fixture-thread",
    itemId: "image_remote_ref",
    path: ["result", "image"],
    mime: "image/png",
    bytes: png.length,
    width: 16,
    height: 12,
    preview: png,
  },
};
