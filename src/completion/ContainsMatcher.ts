export const containsMatch = (
  candidateName: string,
  searchText: string,
): boolean =>
  candidateName
    .toLocaleLowerCase("en-US")
    .includes(searchText.toLocaleLowerCase("en-US"));
