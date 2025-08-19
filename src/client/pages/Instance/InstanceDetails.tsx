import React from 'react';

type Props = {
  phoneNumber: string;
};

const InstanceDetails = ({ phoneNumber }: Props) => {
  return <div>{phoneNumber}</div>;
};

export default InstanceDetails;
