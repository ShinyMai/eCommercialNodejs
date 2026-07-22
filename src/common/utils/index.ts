"use strict";

import _ from "lodash";

interface GetInfoData {
  field: string[];
  object: Record<string, any>;
}
const getInfoData = ({ field = [], object = {} }: GetInfoData) => {
  return _.pick(object, field);
};

export { getInfoData };
