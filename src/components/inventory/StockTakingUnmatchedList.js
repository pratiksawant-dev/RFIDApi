import React from 'react';
import StockTakingMatchedList from './StockTakingMatchedList';

const StockTakingUnmatchedList = (props) => (
  <StockTakingMatchedList {...props} variant="unmatched" />
);

export default StockTakingUnmatchedList;
