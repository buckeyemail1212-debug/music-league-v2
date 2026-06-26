let pending: string[] | null = null;

export const setPendingInvitees = (ids: string[]) => {
  pending = ids;
};

export const consumePendingInvitees = (): string[] | null => {
  const p = pending;
  pending = null; // consume — read once, then cleared
  return p;
};
