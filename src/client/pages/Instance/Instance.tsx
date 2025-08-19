import React from 'react';
import { useParams } from 'react-router-dom';
import InstanceTable from '@client/pages/Instance/InstanceTable';
import InstanceDetails from '@client/pages/Instance/InstanceDetails';

const Instance = () => {
  const { phoneNumber } = useParams<{ phoneNumber?: string }>();

  return phoneNumber ? <InstanceDetails phoneNumber={phoneNumber} /> : <InstanceTable />;
};

export default Instance;
