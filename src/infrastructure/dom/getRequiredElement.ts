type ElementConstructor<TElement extends Element> = {
  new (): TElement;
};

const escapeSelectorId = (id: string): string => {
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(id);

  return id.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
};

const getElementDescription = (element: Element): string => {
  const constructorName = element.constructor?.name ?? "unknown constructor";
  const tagName = element.tagName ? `/${element.tagName.toLowerCase()}` : "";

  return `${constructorName}${tagName}`;
};

export const getRequiredElement = <TElement extends Element>(
  root: ParentNode,
  id: string,
  expectedConstructor: ElementConstructor<TElement>,
): TElement => {
  const element = root.querySelector(`#${escapeSelectorId(id)}`);

  if (!element) {
    throw new Error(`Missing required element #${id}`);
  }

  if (!(element instanceof expectedConstructor)) {
    throw new Error(
      `Element #${id} has an unexpected type. Expected ${expectedConstructor.name}, received ${getElementDescription(element)}.`,
    );
  }

  return element;
};
