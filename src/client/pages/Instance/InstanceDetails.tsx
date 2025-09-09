import React from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@client/shared/components/Button/Button';

type Props = {
  phoneNumber: string;
};

const InstanceDetails = ({ phoneNumber }: Props) => {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate('/instance');
  };

  return (
    <div className="p-4">
      <div className="mb-4">
        <Button buttonType="flat" onClick={handleBack}>
          ← Back to Instances
        </Button>
      </div>
      <div>{phoneNumber}</div>
    </div>
  );
};

export default InstanceDetails;
