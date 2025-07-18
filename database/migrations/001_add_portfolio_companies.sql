-- Migration: Add portfolio companies tracking tables
-- Created: 2025-07-18
-- Description: Add tables to track workflow executions and portfolio companies

-- Create workflow_executions table
CREATE TABLE workflow_executions (
    id SERIAL PRIMARY KEY,
    workflow_name VARCHAR(255) NOT NULL,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'running',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create portfolio_companies table
CREATE TABLE portfolio_companies (
    id SERIAL PRIMARY KEY,
    workflow_execution_id INTEGER REFERENCES workflow_executions(id),
    firm_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(workflow_execution_id, company_name)
);

-- Add indexes for performance
CREATE INDEX idx_workflow_executions_workflow_name ON workflow_executions(workflow_name);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_portfolio_companies_firm_name ON portfolio_companies(firm_name);
CREATE INDEX idx_portfolio_companies_company_name ON portfolio_companies(company_name);
CREATE INDEX idx_portfolio_companies_workflow_execution_id ON portfolio_companies(workflow_execution_id);

-- Add comments for documentation
COMMENT ON TABLE workflow_executions IS 'Tracks each execution of a workflow';
COMMENT ON TABLE portfolio_companies IS 'Stores portfolio companies discovered during PE research workflows';
COMMENT ON COLUMN workflow_executions.status IS 'Status: running, completed, failed';
COMMENT ON COLUMN portfolio_companies.firm_name IS 'Name of the private equity firm';
COMMENT ON COLUMN portfolio_companies.company_name IS 'Name of the portfolio company';