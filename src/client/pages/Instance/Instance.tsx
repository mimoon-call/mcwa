import React from 'react';
import { useParams } from 'react-router-dom';
import InstanceTable from '@client/pages/Instance/InstanceTable';
import InstanceChat from '@client/pages/Instance/InstanceChat';

const Instance = () => {
  const { phoneNumber } = useParams<{ phoneNumber?: string }>();

  return phoneNumber ? <InstanceChat /> : <InstanceTable />;
};

export default Instance;
