import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Immediate redirect
    navigate('/instance', { replace: true });
  }, [navigate]);

  return <></>; // or a loading spinner
};

export default Home;
