#include "../include/gauss_seidel_sle_solver.h"

#include <cmath>
#include <assert.h>
#include <vector>

namespace {
struct SparseRows {
    std::vector<int> offset, column;
    std::vector<double> value;
    void build(atg_scs::Matrix &matrix) {
        const int n=matrix.getHeight();offset.resize(n+1);column.clear();value.clear();
        for(int i=0;i<n;i++) {
            offset[i]=column.size();
            for(int j=0;j<n;j++)if(i!=j&&matrix.get(j,i)!=0) {
                column.push_back(j);value.push_back(matrix.get(j,i));
            }
        }
        offset[n]=column.size();
    }
};
bool finiteVector(atg_scs::Matrix *v) {
    for(int i=0;i<v->getHeight();i++)if(!std::isfinite(v->get(0,i)))return false;
    return true;
}
// Preserve ascending summation order and all nonzero coefficients. No changed
// tolerance/iteration count; nonfinite iterates retain the original dense path.
double sparseIteration(SparseRows &rows,atg_scs::Matrix &left,atg_scs::Matrix &right,
                       atg_scs::Matrix *limits,atg_scs::Matrix *result) {
    double maxDifference=0;
    for(int i=0;i<result->getHeight();i++) {
        double s0=0,s1=0;
        for(int at=rows.offset[i];at<rows.offset[i+1];at++) {
            const int j=rows.column[at];
            if(j<i)s0+=rows.value[at]*result->get(0,j);
            else s1+=rows.value[at]*result->get(0,j);
        }
        const double previous=result->get(0,i);
        const double next=(1/left.get(i,i))*(right.get(0,i)-s0-s1);
        const double x=limits?std::fmax(limits->get(0,i),std::fmin(limits->get(1,i),next)):next;
        const double minimum=std::fmax(1E-3,limits?std::abs(previous):previous);
        const double delta=limits?std::abs(x-previous)/minimum:(std::abs(x)-minimum)/minimum;
        if(delta>maxDifference)maxDifference=delta;
        result->set(0,i,x);
    }
    return maxDifference;
}
}

atg_scs::GaussSeidelSleSolver::GaussSeidelSleSolver()
    : atg_scs::SleSolver(true)
{
    m_maxIterations = 128;
    m_minDelta = 1E-1;

    m_M.initialize(1, 1);
}

atg_scs::GaussSeidelSleSolver::~GaussSeidelSleSolver() {
    m_M.destroy();
    m_reg.destroy();
}

bool atg_scs::GaussSeidelSleSolver::solve(
        SparseMatrix<3> &J,
        Matrix &W,
        Matrix &right,
        Matrix *previous,
        Matrix *result)
{
    const int n = right.getHeight();
    
    result->resize(1, n);

    if (previous != nullptr && previous->getHeight() == n) {
        result->set(previous);
    }

    J.rightScale(W, &m_reg);
    m_reg.multiplyTranspose(J, &m_M);

    thread_local SparseRows rows;
    rows.build(m_M);

    for (int i = 0; i < m_maxIterations; ++i) {
        const double maxDelta = finiteVector(result)?sparseIteration(rows,m_M,right,nullptr,result):solveIteration(
                m_M,
                right,
                result,
                result);

        if (maxDelta < m_minDelta) {
            return true;
        }
    }

    return false;
}

bool atg_scs::GaussSeidelSleSolver::solveWithLimits(
    SparseMatrix<3> &J,
    Matrix &W,
    Matrix &right,
    Matrix &limits,
    Matrix *result,
    Matrix *previous)
{
    const int n = right.getHeight();
    if (result->getHeight() != n) {
        result->initialize(1, n);
    }

    if (previous != nullptr && previous->getHeight() == n) {
        result->set(previous);
    }

    J.rightScale(W, &m_reg);
    m_reg.multiplyTranspose(J, &m_M);

    thread_local SparseRows rows;
    rows.build(m_M);

    for (int i = 0; i < m_maxIterations; ++i) {
        const double maxDelta = finiteVector(result)?sparseIteration(rows,m_M,right,&limits,result):solveIteration(
            m_M,
            right,
            limits,
            result,
            result);

        if (maxDelta < m_minDelta) {
            return true;
        }
    }

    return false;
}

double atg_scs::GaussSeidelSleSolver::solveIteration(
        Matrix &left,
        Matrix &right,
        Matrix *k_next,
        Matrix *k)
{
    double maxDifference = 0.0;
    const int n = k->getHeight();

    for (int i = 0; i < n; ++i) {
        double s0 = 0.0, s1 = 0.0;
        for (int j = 0; j < i; ++j) {
            s0 += left.get(j, i) * k_next->get(0, j);
        }

        for (int j = i + 1; j < n; ++j) {
            s1 += left.get(j, i) * k->get(0, j);
        }

        const double k_next_i =
            (1 / left.get(i, i)) * (right.get(0, i) - s0 - s1);

        const double min_k = std::fmax(1E-3, k->get(0, i));
        const double delta = (std::abs(k_next_i) - min_k) / min_k;
        maxDifference = (delta > maxDifference)
            ? delta
            : maxDifference;

        k_next->set(0, i, k_next_i);
    }

    return maxDifference;
}

double atg_scs::GaussSeidelSleSolver::solveIteration(
        Matrix &left,
        Matrix &right,
        Matrix &limits,
        Matrix *k_next,
        Matrix *k)
{
    double maxDifference = 0.0;
    const int n = k->getHeight();

    for (int i = 0; i < n; ++i) {
        double s0 = 0.0, s1 = 0.0;
        for (int j = 0; j < i; ++j) {
            s0 += left.get(j, i) * k_next->get(0, j);
        }

        for (int j = i + 1; j < n; ++j) {
            s1 += left.get(j, i) * k->get(0, j);
        }

        const double k_next_i =
            (1 / left.get(i, i)) * (right.get(0, i) - s0 - s1);

        const double limitMin = limits.get(0, i);
        const double limitMax = limits.get(1, i);
        const double x = std::fmax(limitMin, std::fmin(limitMax, k_next_i));

        const double min_k = std::fmax(1E-3, std::abs(k->get(0, i)));
        const double delta = std::abs(x - k->get(0, i)) / min_k;
        maxDifference = (delta > maxDifference)
            ? delta
            : maxDifference;

        k_next->set(0, i, x);
    }

    return maxDifference;
}
