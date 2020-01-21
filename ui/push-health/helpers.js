// eslint-disable-next-line import/prefer-default-export
export const resultColorMap = {
  pass: 'success',
  fail: 'danger',
  indeterminate: 'warning',
  done: 'info',
  'in progress': 'secondary',
};

export const filterTests = (tests, filterStr) => {
  const filters = filterStr.split(' ').map(filter => new RegExp(filter));

  return tests.reduce(
    (acc, test) =>
      filters.every(filter => filter.test(test.testName))
        ? [...acc, test]
        : acc,
    [],
  );
};
