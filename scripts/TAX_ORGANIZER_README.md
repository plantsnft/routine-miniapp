# Tax Organizer Tool

This tool helps organize your tax transactions by year and identifies where losses can potentially be applied. **This is data organization only - not tax advice. Always consult with your CPA.**

## Features

- ✅ Organizes transactions by tax year (2020-2024)
- ✅ Categorizes transactions (income, gains, losses, expenses)
- ✅ Identifies loss carryforward opportunities
- ✅ Generates CPA-ready reports and CSV exports
- ✅ Handles multiple transaction types:
  - Crypto gains/losses
  - Stock gains/losses
  - Rental income/expenses
  - Business income/expenses
  - Other income/expenses

## Setup

First, install the Excel reading package:

```bash
npm install xlsx
```

Or if you prefer to convert Excel to CSV manually, you can skip this step.

## Usage

### Option 1: Direct Excel File (Recommended)

```bash
tsx scripts/tax-organizer.ts path/to/your/transactions.xlsx
```

### Option 2: CSV File

If you convert your Excel to CSV first:

```bash
tsx scripts/tax-organizer.ts path/to/your/transactions.csv
```

## Input File Format

Your Excel/CSV file should have columns like this:

| Date | Description | Amount | Notes |
|------|-------------|--------|-------|
| 2021-01-15 | Bought Bitcoin on Coinbase | -5000 | Initial investment |
| 2021-06-20 | Sold Bitcoin | 3000 | Realized loss |
| 2022-03-10 | Rental income from property | 2000 | Monthly rent |
| 2022-03-15 | Property maintenance | -500 | Repair costs |
| 2023-05-01 | Stock gift from dad | 10000 | Apple stock |
| 2023-08-15 | Sold stock | 12000 | Realized gain |
| 2024-01-20 | Book business revenue | 500 | Wife's business |
| 2024-02-10 | Paint business expense | -200 | Supplies |

**Important:**
- Dates should be in YYYY-MM-DD format or Excel date format
- Amounts: Use negative for expenses/losses, positive for income/gains
- The tool will auto-categorize based on keywords in the description

## Output

The tool generates:

1. **tax_organizer_report.txt** - Comprehensive report with:
   - Summary by year
   - Detailed transactions organized by category
   - Loss carryforward analysis
   - Guidance on loss application rules

2. **tax_exports/** folder with:
   - `tax_2020.csv`, `tax_2021.csv`, etc. - One file per year
   - `summary_by_year.csv` - Summary totals

## Understanding Loss Carryforward

The tool calculates potential loss carryforwards based on general tax rules:

- **Capital losses** can offset capital gains in the same year
- Unused capital losses can offset up to **$3,000 of ordinary income per year**
- Remaining losses **carry forward** to future years indefinitely
- **Business losses** (NOL) have different rules - consult your CPA
- **Rental losses** may be limited by passive activity rules - consult your CPA

## What the Tool Does

1. **Categorizes transactions** by type:
   - Income (salary, rental income, business income)
   - Capital gains (crypto gains, stock gains)
   - Capital losses (crypto losses, stock losses)
   - Expenses (rental expenses, business expenses)

2. **Organizes by tax year** (calendar year for US taxes)

3. **Calculates net income** per year

4. **Identifies loss carryforward opportunities**:
   - Shows unused losses that can carry forward
   - Suggests which years losses might be most beneficial to apply

## Next Steps

1. Run the tool on your Excel file
2. Review the generated report
3. Share the CSV exports and report with your CPA
4. Your CPA will:
   - Verify the categorization
   - Determine actual loss carryforward amounts
   - File your returns for all years
   - Optimize loss application strategy

## Customization

If your Excel file has different column names or structure, you can modify the `parseTransactions` function in `tax-organizer.ts` to match your format.

## Questions?

The tool includes general guidance, but for specific questions about:
- Which years to apply losses
- Business loss rules (NOL)
- Rental property passive activity limits
- Marriage filing status changes
- Gift tax implications

**Always consult with your CPA.**
