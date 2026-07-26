export const claimContentInstance = (
  bridge: Pick<HTMLElement, "dataset">,
): (() => boolean) => {
  const instanceId = crypto.randomUUID();
  bridge.dataset.isolatedInstance = instanceId;
  return () => bridge.dataset.isolatedInstance === instanceId;
};
