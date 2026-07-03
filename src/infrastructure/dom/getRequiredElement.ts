type ElementConstructor<TElement extends Element> = {
  new (): TElement;
};

export const getRequiredElement = <TElement extends Element>(
  root: ParentNode,
  id: string,
  expectedConstructor: ElementConstructor<TElement>,
): TElement => {
  const element = root.querySelector(`#${CSS.escape(id)}`);

  if (!element) {
    throw new Error(`Missing required element #${id}`);
  }

  if (!(element instanceof expectedConstructor)) {
    throw new Error(`Element #${id} has an unexpected type`);
  }

  return element;
};
